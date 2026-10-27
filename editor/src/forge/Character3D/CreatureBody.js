/**
 * RRCreatureBody - the Character Builder's four-legged body plan: a recipe of
 * slider and option values in, a skinned, vertex-colored creature out.
 *
 * The body is an implicit surface laid over a quadruped skeleton the way the
 * animal is built: a deep rib cage and a narrower waist, shoulder blades on
 * the ribs, haunches over the hips, legs with their real joints (shoulder,
 * elbow, carpus and paw in front; hip, stifle, hock and paw behind, the hock
 * bent back), the muscles over each bone (deltoid, triceps, forearm, thigh,
 * hamstring, calf and the tendon to the hock), paws with pads and toes or
 * hooves, and a head of cranium, brows, cheekbones, muzzle, whisker pads,
 * nose pad, chin and jaw with the eyes in sockets. The pieces blend by a
 * tight smooth minimum (a few are smoothly cut away: eye sockets, the
 * philtrum) and the field is meshed by surface nets over a narrow band
 * around the surface, then laid onto the true surface; the saved file is
 * meshed finer and reduced by quadric edge collapse (RRQuadricDecimator).
 * Thin things a field would lose (ears, tails, horns, antlers, tusks, claws,
 * spines) are lofted tubes; a lion's mane and a shaggy coat are strand cards
 * over the body, as many as the hair budget allows. Skin weights come from
 * how near each vertex lies to the shapes of each bone; coat patterns are
 * painted per vertex.
 *
 * With `anatomy.detail` on, the external genitalia of the chosen sex and the
 * teats of the species are attached to the current body surface. Anatomy
 * controls retain a resting sheath at zero visible length, with a separately
 * adjustable free portion and a bounded local detail mesh.
 *
 * Bones carry the 3D Models Rig tool's quadruped names (Hips, Spine, Chest,
 * Neck, Head, Tail, LeftFrontUpperLeg …), so the built-in quadruped motions
 * drive the file's own skeleton. Frame: y up, facing +z, the creature's
 * left at +x, meters, standing on y = 0. `size` is the distance between the
 * shoulder and hip joints in meters.
 *
 * No DOM and no three.js here: the builder page and the node tests share it.
 */
(function(root) {
    'use strict';

    const Gear = root.RRCreatureGear || (typeof require === 'function' ? (() => { try { return require('./CreatureGear.js'); } catch (e) { return null; } })() : null);
    const Forms = root.RRCreatureForms || (typeof require === 'function' ? require('./CreatureForms.js') : null);
    const Flyers = root.RRCreatureFlyers || (typeof require === 'function' ? require('./CreatureFlyers.js') : null);
    const Decimator = root.RRQuadricDecimator || (typeof require === 'function' ? (() => { try { return require('../../utils/QuadricDecimator.js'); } catch (e) { return null; } })() : null);

    // ── small math ─────────────────────────────────────────────────────────
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    // (Math.hypot is several times slower than the square root of the sum, and the coat painter calls this per texel.)
    const len = a => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
    const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
    const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
    const mirror = p => [-p[0], p[1], p[2]];
    const same = p => p;
    const DEG = Math.PI / 180;

    // ── noise ──────────────────────────────────────────────────────────────
    function hash3(x, y, z, seed) {
        let h = (x * 374761393 + y * 668265263 + z * 1274126177 + seed * 2246822519) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }
    function valueNoise(x, y, z, seed) {
        const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
        const xf = x - xi, yf = y - yi, zf = z - zi;
        const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
        let out = 0;
        for (let c = 0; c < 8; c++) {
            const dx = c & 1, dy = (c >> 1) & 1, dz = c >> 2;
            out += hash3(xi + dx, yi + dy, zi + dz, seed) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
        }
        return out * 2 - 1;
    }
    function fbm(x, y, z, seed, octaves = 3) {
        let sum = 0, amp = 0.5, f = 1;
        for (let o = 0; o < octaves; o++) { sum += amp * valueNoise(x * f, y * f, z * f, seed + o * 17); amp *= 0.5; f *= 2.03; }
        return sum;
    }
    /** Distance to the nearest and second-nearest jittered cell point. */
    function worley(x, y, z, seed) {
        const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
        let d1 = 81, d2 = 81;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
            const cx = xi + i, cy = yi + j, cz = zi + k;
            const dx = cx + hash3(cx, cy, cz, seed) - x, dy = cy + hash3(cx, cy, cz, seed + 1) - y, dz = cz + hash3(cx, cy, cz, seed + 2) - z;
            const d = dx * dx + dy * dy + dz * dz;
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
        }
        return [Math.sqrt(d1), Math.sqrt(d2)];
    }
    function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

    // ── color ──────────────────────────────────────────────────────────────
    const toLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const hexRgb = hex => { const n = parseInt(String(hex || '#888888').slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
    const mixRgb = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const HEX = /^#[0-9a-f]{6}$/i;

    // ── the recipe ─────────────────────────────────────────────────────────
    /** Sliders: `natural` is the everyday range; min/max run on to the extremes. */
    const SLIDERS = [
        { key: 'size', label: 'Size', section: 'Body', min: 0.06, max: 4, step: 0.01, natural: [0.15, 1.6], unit: 'm' },
        { key: 'bodyLength', label: 'Body length', section: 'Body', min: 0.4, max: 2.5, step: 0.01, natural: [0.75, 1.4] },
        { key: 'girth', label: 'Girth', section: 'Body', min: 0.3, max: 2.6, step: 0.01, natural: [0.7, 1.45] },
        { key: 'chestDepth', label: 'Chest depth', section: 'Body', min: 0.5, max: 2.2, step: 0.01, natural: [0.75, 1.35] },
        { key: 'belly', label: 'Belly', section: 'Body', min: -1.5, max: 3, step: 0.01, natural: [-1, 1] },
        { key: 'hump', label: 'Shoulder hump', section: 'Body', min: 0, max: 2.5, step: 0.01, natural: [0, 1] },
        { key: 'hipHeight', label: 'Hip height', section: 'Body', min: 0.5, max: 1.6, step: 0.01, natural: [0.8, 1.2] },
        { key: 'fluff', label: 'Fur shagginess', section: 'Body', min: 0, max: 2, step: 0.01, natural: [0, 1] },
        { key: 'legLength', label: 'Leg length', section: 'Legs and feet', min: 0.2, max: 2.4, step: 0.01, natural: [0.45, 1.35] },
        { key: 'legThickness', label: 'Leg thickness', section: 'Legs and feet', min: 0.3, max: 2.6, step: 0.01, natural: [0.65, 1.5] },
        { key: 'pawSize', label: 'Paw size', section: 'Legs and feet', min: 0.3, max: 2.6, step: 0.01, natural: [0.7, 1.5] },
        { key: 'plantigrade', label: 'Flat feet', section: 'Legs and feet', min: 0, max: 1, step: 0.01, natural: [0, 1] },
        { key: 'neckLength', label: 'Neck length', section: 'Head', min: 0.1, max: 3.2, step: 0.01, natural: [0.4, 1.6] },
        { key: 'neckThickness', label: 'Neck thickness', section: 'Head', min: 0.4, max: 2.4, step: 0.01, natural: [0.7, 1.4] },
        { key: 'neckAngle', label: 'Neck raise', section: 'Head', min: -10, max: 95, step: 1, natural: [10, 75], unit: '°' },
        { key: 'headSize', label: 'Head size', section: 'Head', min: 0.4, max: 2.6, step: 0.01, natural: [0.7, 1.4] },
        { key: 'snoutLength', label: 'Snout length', section: 'Head', min: 0, max: 3, step: 0.01, natural: [0.2, 1.7] },
        { key: 'snoutWidth', label: 'Snout width', section: 'Head', min: 0.3, max: 2.2, step: 0.01, natural: [0.6, 1.4] },
        { key: 'headPitch', label: 'Head tilt', section: 'Head', min: -20, max: 80, step: 1, natural: [0, 60], unit: '°' },
        { key: 'eyeSize', label: 'Eye size', section: 'Head', min: 0.3, max: 3, step: 0.01, natural: [0.6, 1.6] },
        { key: 'eyeSide', label: 'Eyes to the side', section: 'Head', min: 0, max: 1, step: 0.01, natural: [0, 1] },
        { key: 'earSize', label: 'Ear size', section: 'Head', min: 0, max: 3.5, step: 0.01, natural: [0.4, 1.8] },
        { key: 'earDroop', label: 'Ear droop', section: 'Head', min: -1, max: 1.5, step: 0.01, natural: [-1, 1] },
        { key: 'tailLength', label: 'Tail length', section: 'Tail', min: 0, max: 3, step: 0.01, natural: [0, 1.5] },
        { key: 'tailThickness', label: 'Tail thickness', section: 'Tail', min: 0.2, max: 3, step: 0.01, natural: [0.5, 1.6] },
        { key: 'tailCurl', label: 'Tail carriage', section: 'Tail', min: -1.5, max: 1.5, step: 0.01, natural: [-1, 1] },
        { key: 'hornSize', label: 'Horn size', section: 'Features', min: 0, max: 3, step: 0.01, natural: [0.3, 1.5] },
        { key: 'tuskSize', label: 'Tusks', section: 'Features', min: 0, max: 2.5, step: 0.01, natural: [0, 1.2] },
        { key: 'maneSize', label: 'Mane size', section: 'Features', min: 0, max: 2.5, step: 0.01, natural: [0, 1.5] },
        { key: 'spines', label: 'Back spines', section: 'Features', min: 0, max: 2.5, step: 0.01, natural: [0, 1] },
        { key: 'wingSize', label: 'Wing size', section: 'Features', min: 0, max: 3, step: 0.01, natural: [0.4, 1.6] },
        { key: 'patternScale', label: 'Pattern scale', section: 'Coat', min: 0.3, max: 3, step: 0.01, natural: [0.5, 2] },
        { key: 'patternAmount', label: 'Pattern strength', section: 'Coat', min: 0, max: 1, step: 0.01, natural: [0, 1] }
    ];

    const OPTIONS = [
        { key: 'ears', label: 'Ears', choices: [['pointed', 'Pointed'], ['round', 'Round'], ['floppy', 'Floppy'], ['long', 'Long'], ['narrow', 'Narrow'], ['small', 'Small'], ['none', 'None']] },
        { key: 'tail', label: 'Tail', choices: [['long', 'Long'], ['bushy', 'Bushy'], ['stub', 'Stub'], ['tufted', 'Tufted'], ['horse', 'Hair'], ['thick', 'Thick'], ['curly', 'Curly'], ['none', 'None']] },
        { key: 'horns', label: 'Horns', choices: [['none', 'None'], ['antlers', 'Antlers'], ['bull', 'Bull'], ['ram', 'Ram'], ['goat', 'Goat'], ['unicorn', 'Unicorn'], ['rhino', 'Nose horn'], ['dragon', 'Dragon']] },
        { key: 'feet', label: 'Feet', choices: [['paw', 'Paws'], ['hoof', 'Hooves'], ['claw', 'Claws']] },
        { key: 'wings', label: 'Wings', choices: [['none', 'None'], ['bat', 'Bat'], ['feathered', 'Feathered']] },
        { key: 'mane', label: 'Mane', choices: [['none', 'None'], ['lion', 'Lion'], ['horse', 'Crest'], ['ruff', 'Ruff']] },
        { key: 'pattern', label: 'Pattern', choices: [['solid', 'Solid'], ['countershade', 'Light belly'], ['spots', 'Spots'], ['rosettes', 'Rosettes'], ['stripes', 'Stripes'], ['tabby', 'Tabby'], ['socks', 'Socks'], ['points', 'Color points'], ['saddle', 'Saddle'], ['piebald', 'Patches'], ['dapple', 'Dapple'], ['scales', 'Scales']] }
    ].map(o => ({ key: o.key, label: o.label, choices: o.choices.map(([id, label]) => ({ id, label })) }));

    /** Colors: coat, the pattern's marking color, the light belly/muzzle, nose/hooves/claws, horns, eyes, mane. */
    const COLORS = [
        { key: 'coat', label: 'Coat' }, { key: 'marking', label: 'Markings' }, { key: 'light', label: 'Light fur' },
        { key: 'nose', label: 'Nose' }, { key: 'hoof', label: 'Hooves and claws' }, { key: 'horn', label: 'Horns' }, { key: 'eye', label: 'Eyes' }, { key: 'mane', label: 'Mane and tail hair' }
    ];

    /** The sexes `anatomy.sex` may name. */
    const SEXES = ['male', 'female'];
    const ANATOMY_SLIDERS = [
        { key: 'sheath', label: 'Sheath size', sex: 'male', value: 1, natural: [0.5, 1.5], min: 0.3, max: 2.5 },
        { key: 'length', label: 'Visible length', sex: 'male', value: 0, natural: [0, 1], min: 0, max: 2 },
        { key: 'girth', label: 'Girth', sex: 'male', value: 1, natural: [0.5, 1.5], min: 0.3, max: 2.5 },
        { key: 'testicles', label: 'Testicles', sex: 'male', value: 1, natural: [0, 1.5], min: 0, max: 2.5 },
        { key: 'vulva', label: 'Vulva size', sex: 'female', value: 1, natural: [0.5, 1.5], min: 0.3, max: 2.5 },
        { key: 'udder', label: 'Udder size', sex: 'female', value: 1, natural: [0, 1.5], min: 0, max: 2.5 },
        { key: 'teats', label: 'Teat size', sex: 'female', value: 1, natural: [0, 1.5], min: 0, max: 2.5 }
    ];

    const DEFAULT_RECIPE = Object.freeze({
        plan: 'quadruped', kind: 'dog',
        size: 0.42, bodyLength: 1, girth: 1, chestDepth: 1, belly: 0, hump: 0, hipHeight: 1, fluff: 0.2,
        legLength: 1, legThickness: 1, pawSize: 1, plantigrade: 0,
        neckLength: 1, neckThickness: 1, neckAngle: 40, headSize: 1, snoutLength: 1, snoutWidth: 1, headPitch: 15, eyeSize: 1, eyeSide: 0.2,
        earSize: 1, earDroop: 0, tailLength: 0.9, tailThickness: 1, tailCurl: 0, hornSize: 1, tuskSize: 0, maneSize: 0, spines: 0, wingSize: 1,
        patternScale: 1, patternAmount: 1,
        ears: 'pointed', tail: 'long', horns: 'none', feet: 'paw', wings: 'none', mane: 'none', pattern: 'countershade',
        colors: Object.freeze({ coat: '#8a6a48', marking: '#3a2a1e', light: '#e8dcc8', nose: '#2a2220', hoof: '#2a2420', horn: '#d8ccb0', eye: '#6a4a20', mane: '#5a3f28' }),
        anatomy: Object.freeze(Object.assign({ detail: false, sex: 'male' }, Object.fromEntries(ANATOMY_SLIDERS.map(s => [s.key, s.value])))),
        beak: 'hooked',
        gear: Object.freeze([]),
        seed: 1
    });

    /**
     * What a kind is, beyond its sliders: its pupil ('round', 'slit' upright,
     * 'bar' across), whether its hooves are cloven, where a male's sheath and
     * testes lie ('belly' sheath ahead of the thighs with the scrotum between
     * them, 'perineal' the scrotum under the tail as in cats and boars, with
     * the sheath just below it or, where `sheath` is 'belly' (a boar), on the
     * belly, 'pendulous' a hanging scrotum as in bulls and rams, 'cloaca' none
     * outside), its teats: pairs along the belly from `from` (0 the chest) to
     * `to` (1 the groin), or an udder between the thighs; `padColor` for ear
     * backs darker than the coat, `felid` for a cat's face and build, `bigcat`
     * for a big cat's heavy forequarters, `lightFace` for a face its color points
     * leave unmarked (a fox: dark ears and legs only), `face` for a face built
     * and marked as that animal's ('deer', 'cattle', 'rabbit', 'bear', 'sheep',
     * 'reptile').
     */
    const PROFILE = {
        cat: { pupil: 'slit', genital: 'perineal', teats: { pairs: 4, from: 0.15, to: 0.95 }, padColor: true, felid: true },
        lion: { pupil: 'round', genital: 'perineal', teats: { pairs: 2, from: 0.55, to: 0.92 }, padColor: true, felid: true, bigcat: true },
        tiger: { pupil: 'round', genital: 'perineal', teats: { pairs: 2, from: 0.55, to: 0.92 }, padColor: true, felid: true, bigcat: true },
        dog: { pupil: 'round', genital: 'belly', teats: { pairs: 5, from: 0.1, to: 0.95 }, padColor: true },
        wolf: { pupil: 'round', genital: 'belly', teats: { pairs: 5, from: 0.1, to: 0.95 }, padColor: true },
        fox: { pupil: 'slit', genital: 'belly', teats: { pairs: 4, from: 0.2, to: 0.95 }, padColor: true, lightFace: true },
        deer: { pupil: 'bar', cloven: true, genital: 'belly', teats: { udder: 0.5, count: 4 }, face: 'deer' },
        horse: { pupil: 'bar', genital: 'belly', teats: { udder: 0.45, count: 2 } },
        bear: { pupil: 'round', genital: 'belly', teats: { pairs: 3, from: 0.0, to: 0.95 }, padColor: true, face: 'bear' },
        boar: { pupil: 'round', cloven: true, genital: 'perineal', sheath: 'belly', teats: { pairs: 6, from: 0.05, to: 0.95 }, face: 'pig' },
        armadillo: { pupil: 'round', genital: 'belly', teats: { pairs: 2, from: 0.2, to: 0.8 }, padColor: true, face: 'armadillo' },
        pig: { pupil: 'round', cloven: true, genital: 'perineal', sheath: 'belly', teats: { pairs: 6, from: 0.05, to: 0.95 }, face: 'pig' },
        rabbit: { pupil: 'round', genital: 'perineal', teats: { pairs: 4, from: 0.1, to: 0.95 }, face: 'rabbit' },
        bull: { pupil: 'bar', cloven: true, genital: 'pendulous', teats: { udder: 1, count: 4 }, face: 'cattle' },
        ram: { pupil: 'bar', cloven: true, genital: 'pendulous', teats: { udder: 0.7, count: 2 }, face: 'sheep' },
        drake: { pupil: 'slit', genital: 'cloaca', teats: null, face: 'reptile' },
        bird: { pupil: 'round', genital: 'cloaca', teats: null, face: 'bird' },
        crow: { pupil: 'round', genital: 'cloaca', teats: null, face: 'bird' }
    };
    const profileOf = r => PROFILE[r.kind] || PROFILE.dog;
    function anatomySliders(recipe) {
        if (recipe.morphology && recipe.morphology !== 'quadruped') return [];
        const prof = profileOf(recipe);
        if (prof.genital === 'cloaca') return [];
        return ANATOMY_SLIDERS.filter(s => s.sex === recipe.anatomy.sex && (s.key !== 'udder' || prof.teats?.udder)
            && (s.key !== 'teats' || prof.teats));
    }

    const K = (kind, over, colors) => ({ kind, over, colors });
    /** Presets: recipes over the defaults, sized as the grown animal (shoulder to hip joint, in meters). */
    const KINDS = [
        K('cat', { size: 0.23, bodyLength: 0.94, legLength: 0.78, girth: 0.91, chestDepth: 0.92, belly: -0.2, neckLength: 0.38, neckThickness: .86, neckAngle: 44, headSize: 1.62, snoutLength: 0.18, snoutWidth: 0.90, headPitch: 3, eyeSize: 0.96, eyeSide: 0.02, earSize: 0.88, ears: 'pointed', tail: 'long', tailLength: 1.1, tailThickness: 1.12, tailCurl: 0.65, pattern: 'countershade',patternScale:1.5,patternAmount:.72,pawSize: 1.16, legThickness: .93, fluff: 0.24 },
            { coat: '#b58a5a', marking: '#4a3220', light: '#efe2cc', nose: '#c87a78', eye: '#9cb66c', mane: '#b58a5a' }),
        K('lion', { size: 0.86, bodyLength: 1.08, legLength: 1.05, girth: 1.0, chestDepth: 1.15, belly: -0.35, hump: 0, neckLength: 0.75, neckThickness: 0.95, neckAngle: 22, headSize: 1.42, snoutLength: 0.72, snoutWidth: 1.22, headPitch: 10, eyeSize: 0.85, eyeSide: 0.04, earSize: 0.7, ears: 'round', tail: 'tufted', tailLength: 1.05, tailThickness: 0.95, tailCurl: -0.35, mane: 'lion', maneSize: 1.0, pattern: 'countershade', pawSize: 1.2, legThickness: 1.28, fluff: 0.15 },
            { coat: '#c49556', marking: '#3a2618', light: '#ead6ae', nose: '#a8645a', eye: '#b98a32', mane: '#6e4322' }),
        K('tiger', { size: 0.88, bodyLength: 1.12, legLength: 0.98, girth: 1.0, chestDepth: 1.12, belly: -0.35, neckLength: 0.8, neckThickness: 0.95, neckAngle: 22, headSize: 1.18, snoutLength: 0.68, snoutWidth: 1.2, headPitch: 10, eyeSize: 0.85, eyeSide: 0.04, earSize: 0.8, ears: 'round', tail: 'long', tailLength: 1.15, tailThickness: 1, tailCurl: -0.25, mane: 'none', maneSize: 0, pattern: 'stripes', pawSize: 1.2, legThickness: 1.12, fluff: 0.2 },
            { coat: '#d8782a', marking: '#1e1610', light: '#f2e8d8', nose: '#c07a70', eye: '#d0a030', mane: '#d8782a' }),
        K('dog', { size: 0.42, legLength: 1.02, girth: 0.95, chestDepth: 1.05, belly: -0.4, neckLength: 1, neckAngle: 38, headSize: 1.15, snoutLength: 0.85, snoutWidth: 1, headPitch: 14, tailThickness: 1.1, earSize: 1.1, earDroop: 0.35, tailCurl: 0.25, legThickness: 0.95 }, {}),
        K('wolf', { size: 0.55, legLength: 1.12, girth: 0.9, chestDepth: 1.2, belly: -0.6, neckLength: 1, neckAngle: 30, headSize: 1.12, snoutLength: 1.0, snoutWidth: 0.95, headPitch: 15, eyeSize: 0.85, earSize: 1, ears: 'pointed', tail: 'bushy', tailLength: 0.85, tailThickness: 1.2, tailCurl: -0.6, mane: 'ruff', maneSize: 0.6, pattern: 'saddle', fluff: 0.55, legThickness: 1.0 },
            { coat: '#857a6c', marking: '#3a3632', light: '#d9cfbd', nose: '#1e1c1a', eye: '#c8a040', mane: '#80776a' }),
        K('fox', { size: 0.3, legLength: 0.92, girth: 0.82, chestDepth: 0.98, belly: -0.4, neckLength: 0.9, neckAngle: 34, headSize: 1.05, snoutLength: 1.0, snoutWidth: 0.7, headPitch: 12, eyeSize: 1, earSize: 1.45, ears: 'pointed', tail: 'bushy', tailLength: 1.15, tailThickness: 1.5, tailCurl: -0.25, pattern: 'points', fluff: 0.45, legThickness: 0.8 },
            { coat: '#d06a24', marking: '#2a1c14', light: '#f4ece0', nose: '#1a1412', eye: '#c08a20', mane: '#d06a24' }),
        K('deer', { size: 0.6, legLength: 1.32, girth: 0.88, chestDepth: 1.08, belly: -0.3, neckLength: 1.35, neckThickness: 1.15, neckAngle: 55, headSize: 1.05, snoutLength: 1.05, snoutWidth: 0.8, headPitch: 42, eyeSize: 1.35, eyeSide: 0.85, earSize: 1.75, ears: 'narrow', earDroop: 0.35, tail: 'stub', tailLength: 0.35, feet: 'hoof', horns: 'antlers', hornSize: 1.1, legThickness: 0.72, pattern: 'countershade', fluff: 0.05 },
            { coat: '#9a6a40', marking: '#5a3a22', light: '#f0e6d6', nose: '#1e1816', horn: '#c8b090', eye: '#2a1a10', mane: '#9a6a40' }),
        K('horse', { size: 0.95, legLength: 1.36, girth: 1.1, belly: 0.1, neckLength: 1.55, neckAngle: 52, neckThickness: 1.5, headSize: 1.42, snoutLength: 1.35, snoutWidth: 1.05, headPitch: 58, chestDepth: 1.3, pawSize: 1.25, eyeSize: 1.3, eyeSide: 0.9, earSize: 1.1, ears: 'narrow', tail: 'horse', tailLength: 1.05, tailThickness: 1.2, tailCurl: -0.9, feet: 'hoof', mane: 'horse', maneSize: 1.2, pattern: 'socks', legThickness: 1.0, fluff: 0.05 },
            { coat: '#7a4a2a', marking: '#f2ede4', light: '#d8c4a8', nose: '#2a2220', eye: '#2a1810', mane: '#1e1612' }),
        K('bear', { size: 0.78, legLength: 0.88, girth: 1.22, chestDepth: 1.08, belly: 0.4, hump: 1.1, hipHeight: 0.96, neckLength: 0.55, neckAngle: 16, neckThickness: 1.45, headSize: 1.34, snoutLength: 0.86, snoutWidth: 1.05, headPitch: 14, eyeSize: 0.62, earSize: 0.8, ears: 'round', tail: 'stub', tailLength: 0.15, feet: 'claw', plantigrade: 1, pawSize: 1.35, legThickness: 1.38, pattern: 'solid', fluff: 0.7 },
            { coat: '#5a3c26', marking: '#3a261a', light: '#a08060', nose: '#1a1412', hoof: '#b3a48a', eye: '#2a1810', mane: '#5a3c26' }),
        K('boar', { size: 0.58, legLength: 0.75, hipHeight: 0.93, girth: 1.22, chestDepth: 1.25, hump: 0.65, belly: -0.1, neckLength: 0.45, neckAngle: 10, neckThickness: 1.5, headSize: 1.18, snoutLength: 1.2, snoutWidth: 0.95, headPitch: 25, eyeSize: 0.6, eyeSide: 0.6, earSize: 0.85, ears: 'pointed', earDroop: 0.2, tail: 'tufted', tailLength: 0.35, tailThickness: 0.6, tailCurl: -0.8, feet: 'hoof', tuskSize: 1, legThickness: 0.85, pattern: 'solid', fluff: 0.8, mane: 'horse', maneSize: 0.85 },
            { coat: '#4a3a30', marking: '#2a201a', light: '#6a5a4a', nose: '#3a2a26', horn: '#ece4d0', eye: '#1a1010', mane: '#2a2018' }),
        // A farm pig: pink and nearly bare, round in the barrel, big ears flopping over the eyes, a curly tail.
        K('pig', { size: 0.5, bodyLength: 1.0, legLength: 0.5, hipHeight: 1.0, girth: 1.42, chestDepth: 1.22, hump: 0, belly: 0.7, neckLength: 0.28, neckAngle: 6, neckThickness: 1.6, headSize: 1.3, snoutLength: 0.5, snoutWidth: 1.15, headPitch: 20, eyeSize: 0.62, eyeSide: 0.6, earSize: 1.15, ears: 'floppy', earDroop: 0.75, tail: 'curly', tailLength: 0.32, tailThickness: 0.55, tailCurl: 0.6, feet: 'hoof', tuskSize: 0, legThickness: 0.88, pattern: 'solid', fluff: 0.12 },
            { coat: '#e7aaa0', marking: '#c9837c', light: '#f0c2b8', nose: '#d78a86', hoof: '#8a6a5a', horn: '#ece4d0', eye: '#2a1810', mane: '#e7aaa0' }),
        // A nine-banded armadillo: low under a banded shell (shoulder shield, flexible bands, hip shield), a small
        // pointed head with a scaled cap and upright ears, a long tapered ringed tail, short legs with digging claws.
        K('armadillo', { size: 0.26, bodyLength: 0.9, legLength: 0.3, hipHeight: 1.1, girth: 1.75, chestDepth: 1.2, hump: 1.1, belly: 0.25, neckLength: 0.34, neckAngle: 10, neckThickness: 0.9, headSize: 1.02, snoutLength: 0.9, snoutWidth: 0.7, headPitch: 22, eyeSize: 0.5, eyeSide: 0.7, earSize: 1.3, ears: 'pointed', tail: 'long', tailLength: 1.4, tailThickness: 1.7, tailCurl: -0.2, feet: 'claw', plantigrade: 0.7, pawSize: 1.15, legThickness: 1.0, pattern: 'solid', fluff: 0 },
            { coat: '#b09484', marking: '#6a5646', light: '#d6bca2', nose: '#b88a80', hoof: '#d8ccb8', horn: '#665242', eye: '#1a1210', mane: '#8f7a68' }),
        K('rabbit', { size: 0.15, bodyLength: 0.74, legLength: 0.34, hipHeight: 1.5, girth: 1.22, chestDepth: 1.1, belly: 0.2, neckLength: 0.3, neckAngle: 46, headSize: 1.38, snoutLength: 0.34, snoutWidth: 0.8, headPitch: 18, eyeSize: 1.3, eyeSide: 1, earSize: 1.55, ears: 'long', earDroop: -0.45, tail: 'stub', tailLength: 0.25, tailThickness: 1.6, tailCurl: 1, plantigrade: 1, pawSize: 1.3, pattern: 'countershade', fluff: 0.6 },
            { coat: '#8a7560', marking: '#4a3a2c', light: '#e6dac8', nose: '#8a6a64', eye: '#3a2216', mane: '#9a8470' }),
        K('bull', { size: 0.95, legLength: 1.0, girth: 1.35, chestDepth: 1.3, belly: 0.25, hump: 0.45, neckLength: 0.6, neckAngle: 15, neckThickness: 1.5, headSize: 1.15, snoutLength: 1.0, snoutWidth: 1.15, headPitch: 35, eyeSize: 1.2, eyeSide: 0.85, earSize: 0.8, ears: 'round', earDroop: 0.7, tail: 'tufted', tailLength: 1, tailThickness: 0.7, tailCurl: -1, feet: 'hoof', horns: 'bull', hornSize: 1, pattern: 'piebald', legThickness: 1.22, fluff: 0.05 },
            { coat: '#2a2220', marking: '#f0ece4', light: '#3a302a', nose: '#c08a8a', horn: '#e0d4b8', eye: '#1a1010', mane: '#1a1412' }),
        K('ram', { size: 0.55, legLength: 0.92, girth: 1.22, chestDepth: 1.1, belly: 0.3, neckLength: 0.7, neckAngle: 35, headSize: 1, snoutLength: 0.85, snoutWidth: 0.85, headPitch: 35, eyeSize: 1, eyeSide: 0.9, earSize: 0.85, ears: 'floppy', earDroop: -0.9, tail: 'stub', tailLength: 0.3, feet: 'hoof', horns: 'ram', hornSize: 1.1, pattern: 'points', legThickness: 0.7, fluff: 1.3 },
            { coat: '#e8e0d0', marking: '#3a3430', light: '#f4f0e8', nose: '#2a2624', horn: '#b8a888', eye: '#a07830', mane: '#e8e0d0' }),
        K('drake', { size: 1.3, bodyLength: 1.25, legLength: 0.78, girth: 1.15, chestDepth: 1.1, belly: 0.2, neckLength: 1.6, neckAngle: 38, headSize: 1.05, snoutLength: 1.3, snoutWidth: 0.9, headPitch: 18, eyeSize: 0.9, eyeSide: 0.35, earSize: 0.7, ears: 'small', tail: 'thick', tailLength: 2.1, tailThickness: 1.5, tailCurl: -0.35, feet: 'claw', plantigrade: 0.7, horns: 'dragon', hornSize: 1.2, spines: 1, wings: 'bat', wingSize: 1.1, pattern: 'scales', legThickness: 1.25, pawSize: 1.3, fluff: 0 },
            { coat: '#2f6a3a', marking: '#1c3a22', light: '#c8b878', nose: '#1a1a14', horn: '#d8d0b0', eye: '#e8b020', mane: '#2f6a3a' })
    ];
    // The drake is listed with the birds and bats it shares the sky with.
    KINDS.find(k => k.kind === 'drake').group = 'Flying animals';
    /**
     * Kinds built for their heads (a beastfolk's head on a person's neck): built as any kind is, not listed
     * among the creatures. A bird's beak is `beak` 'hooked' (a raptor's) or 'straight' (a crow's).
     */
    const HEAD_KINDS = [
        K('bird', { size: 0.45, neckLength: 0.45, neckThickness: 0.85, neckAngle: 55, headSize: 1.15, snoutLength: 0.55, snoutWidth: 0.9, headPitch: 6, eyeSize: 1.15, eyeSide: 0.75, ears: 'none', tail: 'bushy', tailLength: 0.6, tailThickness: 1.2, tailCurl: -0.2, feet: 'claw', wings: 'feathered', wingSize: 1.2, pattern: 'countershade', fluff: 0.1, beak: 'hooked', legThickness: 0.8 },
            { coat: '#6a4a2a', marking: '#3a2616', light: '#ece2cc', nose: '#e0b030', horn: '#3a3638', eye: '#d8a020', mane: '#5a3e24' }),
        K('crow', { size: 0.35, neckLength: 0.4, neckThickness: 0.85, neckAngle: 50, headSize: 1.1, snoutLength: 0.7, snoutWidth: 0.85, headPitch: 4, eyeSize: 0.9, eyeSide: 0.8, ears: 'none', tail: 'bushy', tailLength: 0.7, tailThickness: 1.1, tailCurl: -0.2, feet: 'claw', wings: 'feathered', wingSize: 1.2, pattern: 'solid', fluff: 0.1, beak: 'straight', legThickness: 0.75 },
            { coat: '#24272f', marking: '#3c4458', light: '#34384a', nose: '#1e1e22', horn: '#18181c', eye: '#2a1e14', mane: '#24272f' })
    ];
    KINDS.push(...Forms.KINDS);
    KINDS.push(...(root.RRCreatureReptiles || (typeof require === 'function' ? require('./CreatureReptiles.js') : { KINDS: [] })).KINDS);
    // The Bird preset is an adult bald eagle: its iris is pale yellow (the shared preset's golden brown is a juvenile's).
    { const avian = KINDS.find(k => k.kind === 'avian'); if (avian && Flyers?.BIRDS?.eagle) avian.colors = { ...avian.colors, eye: Flyers.BIRDS.eagle.iris }; }
    const KIND_BY_ID = new Map(KINDS.concat(HEAD_KINDS).map(k => [k.kind, k]));
    const CAT_BREEDS={
        domesticShorthair:{label:'Domestic shorthair',over:{},colors:{}},
        ragamuffin:{label:'Ragamuffin',over:{size:.28,girth:1.12,headSize:1.70,snoutLength:.15,earSize:.76,fluff:1.1,tail:'bushy',tailThickness:1.50,mane:'ruff',maneSize:.40,pattern:'piebald'},colors:{coat:'#e1c7a0',light:'#f4eee1',marking:'#8b6750',nose:'#c7888c',eye:'#8fba72',mane:'#e1c7a0'}},
        ragdoll:{label:'Ragdoll',over:{size:.28,bodyLength:1.10,girth:1.04,headSize:1.55,snoutLength:.22,fluff:1.02,tail:'bushy',tailThickness:1.45,mane:'ruff',maneSize:.35,pattern:'points'},colors:{coat:'#e6dfd0',light:'#f6f1e7',marking:'#6c554d',nose:'#a9797d',eye:'#72b7df',mane:'#e6dfd0'}},
        persian:{label:'Persian',over:{size:.23,bodyLength:.88,girth:1.16,legLength:.64,headSize:1.84,snoutLength:.02,snoutWidth:1.06,earSize:.61,eyeSize:1.26,fluff:1.35,tail:'bushy',tailLength:.88,tailThickness:1.60,mane:'ruff',maneSize:.50,pattern:'solid'},colors:{coat:'#dad4ca',light:'#eee9df',marking:'#89837d',nose:'#c98b8c',eye:'#d3a34f',mane:'#dad4ca'}},
        maineCoon:{label:'Maine Coon',over:{size:.33,bodyLength:1.22,legLength:.91,girth:1.02,headSize:1.50,snoutLength:.36,snoutWidth:1.04,earSize:1.22,eyeSize:1.06,fluff:1.12,tail:'bushy',tailLength:1.30,tailThickness:1.55,mane:'ruff',maneSize:.60,pattern:'tabby',patternScale:1.8},colors:{coat:'#9d8e76',light:'#e1d6bc',marking:'#403a33',nose:'#a97472',eye:'#a1b96a',mane:'#b2a28b'}},
        siamese:{label:'Siamese',over:{size:.24,bodyLength:1.12,legLength:.94,girth:.77,headSize:1.42,snoutLength:.29,snoutWidth:.79,earSize:1.20,eyeSize:1.10,fluff:.16,tailThickness:.84,pattern:'points'},colors:{coat:'#dfd4bb',light:'#efe6d1',marking:'#4a3730',nose:'#695051',eye:'#6aaeda',mane:'#dfd4bb'}},
        britishShorthair:{label:'British shorthair',over:{size:.26,bodyLength:.94,girth:1.18,legLength:.70,headSize:1.83,snoutLength:.12,snoutWidth:1.05,earSize:.70,eyeSize:1.22,fluff:.48,tailThickness:1.55,tailLength:.96,pattern:'solid'},colors:{coat:'#858e9b',light:'#b6bdc6',marking:'#5b6470',nose:'#8d7b86',eye:'#d69d42',mane:'#858e9b'}}
    };
    for(const id of ['ragamuffin','ragdoll','persian','maineCoon'])Object.assign(CAT_BREEDS[id].over,{tailCurl:-.18,neckLength:.32});
    Object.assign(CAT_BREEDS.persian.over,{tailLength:.75,tailThickness:1.9,maneSize:.72});
    Object.assign(CAT_BREEDS.ragamuffin.colors,{coat:'#f2ede4',light:'#fcf8f0',marking:'#78543e',mane:'#f2ede4'});
    Object.assign(CAT_BREEDS.britishShorthair.over,{tailCurl:-.20,tailLength:.80});
    const CAT_TYPE={key:'catType',kind:'cat',form:'quadruped',label:'Cat type',choices:Object.entries(CAT_BREEDS).map(([id,b])=>[id,b.label])};
    const variantsFor=r=>r.kind==='cat'&&r.morphology==='quadruped'?[CAT_TYPE]:Forms.variantsFor(r);
    function withVariant(r,key,value){
        if(key==='catType'){
            if(r.kind!=='cat'||!CAT_BREEDS[value])return normalizeRecipe(r);
            const base=kindRecipe('cat'),breed=CAT_BREEDS[value];
            return normalizeRecipe({...base,...breed.over,catType:value,colors:{...base.colors,...breed.colors}});
        }
        // A bird type brings that bird's typical grown size (an eagle is not a hummingbird).
        // A bird type brings that bird's typical size and eye color too.
        if(key==='birdType'&&Flyers?.BIRD_SIZES?.[value]&&r.kind==='avian'){const v=Forms.withVariant(r,key,value);return normalizeRecipe({...v,size:Flyers.BIRD_SIZES[value],colors:{...v.colors,eye:Flyers.BIRDS[value]?.iris||v.colors.eye}});}
        return normalizeRecipe(Forms.withVariant(r,key,value));
    }

    /** A preset's whole recipe. */
    function kindRecipe(kind) {
        const k = KIND_BY_ID.get(kind) || KIND_BY_ID.get('dog');
        return normalizeRecipe(Object.assign({}, DEFAULT_RECIPE, k.over, { kind: k.kind, colors: Object.assign({}, DEFAULT_RECIPE.colors, k.colors) }));
    }

    /** Anatomical detail: off unless switched on; the sex one of SEXES. */
    function normalizeAnatomy(a) {
        const v = a || {};
        const out = { detail: v.detail === true, sex: SEXES.includes(v.sex) ? v.sex : DEFAULT_RECIPE.anatomy.sex };
        for (const s of ANATOMY_SLIDERS) {
            const n = v[s.key] == null ? s.value : Number(v[s.key]);
            out[s.key] = clamp(Number.isFinite(n) ? n : s.value, s.min, s.max);
        }
        return out;
    }

    /** A full recipe from a partial one: every field present and in its extreme range. */
    function normalizeRecipe(input) {
        const selected = KIND_BY_ID.get(input?.kind);
        const catBreed=input?.kind==='cat'?(CAT_BREEDS[input.catType]||CAT_BREEDS.domesticShorthair):null;
        const r = selected?.form || catBreed ? { ...DEFAULT_RECIPE, ...selected.over,...catBreed?.over, ...input, colors: { ...DEFAULT_RECIPE.colors, ...selected.colors,...catBreed?.colors, ...input?.colors } } : input || {};
        const out = { plan: 'quadruped', kind: KIND_BY_ID.has(r.kind) ? r.kind : DEFAULT_RECIPE.kind };
        for (const s of SLIDERS) {
            const v = Number(r[s.key]);
            out[s.key] = clamp(Number.isFinite(v) ? v : DEFAULT_RECIPE[s.key], s.min, s.max);
        }
        for (const o of OPTIONS) out[o.key] = o.choices.some(c => c.id === r[o.key]) ? r[o.key] : DEFAULT_RECIPE[o.key];
        out.colors = {};
        for (const c of COLORS) {
            const v = r.colors && r.colors[c.key];
            out.colors[c.key] = HEX.test(v || '') ? v.toLowerCase() : DEFAULT_RECIPE.colors[c.key];
        }
        out.anatomy = normalizeAnatomy(r.anatomy);
        out.gear = Gear ? Gear.normalizeGear(r.gear) : [];
        out.seed = Number.isFinite(r.seed) ? r.seed >>> 0 : DEFAULT_RECIPE.seed;
        out.beak = r.beak === 'straight' || r.beak === 'hooked' ? r.beak : DEFAULT_RECIPE.beak;
        if(out.kind==='cat')out.catType=CAT_BREEDS[r.catType]?r.catType:'domesticShorthair';
        return Forms.normalize(out, r, input || {});
    }

    /** Show controls that change this body's actual geometry. */
    function slidersFor(r) {
        if (!r.morphology || r.morphology === 'quadruped') return SLIDERS;
        const common = new Set(['size', 'bodyLength', 'girth', 'chestDepth', 'headSize', 'eyeSize', 'patternScale', 'patternAmount', 'hornSize', 'spines']);
        if (r.morphology === 'jellyfish') common.delete('headSize');
        if (r.eyeCount === 0) common.delete('eyeSize');
        if (['fish','cetacean'].includes(r.morphology) && !['stingray','whale'].includes(r.kind)) { common.add('snoutLength'); common.add('snoutWidth'); }
        if (['fish', 'cetacean'].includes(r.morphology)) common.add('tailLength');
        const winged = ['bee','wasp','mosquito','fly','butterfly','dragonfly'].includes(r.kind);
        if (['avian','bat'].includes(r.morphology) || winged) common.add('wingSize');
        if (['avian','bat'].includes(r.morphology)) for (const key of ['legLength','snoutLength','snoutWidth','tailLength']) common.add(key);
        if (r.morphology === 'avian') common.add('neckLength');
        if (r.kind === 'lobster') common.add('tailLength');
        if (r.morphology === 'reptile') { for (const key of ['tailLength', 'snoutLength']) common.add(key); if (r.kind !== 'snake') common.add('legLength'); common.delete('chestDepth'); common.delete('hornSize'); common.delete('spines'); }
        if (r.kind === 'mosquito') common.add('snoutLength');
        const formSliders=Forms.SLIDERS.filter(s=>{
            if(!s.forms.includes(r.morphology))return false;
            if (s.key === 'wingSpread' && r.morphology === 'arthropod' && !winged) return false;
            if (s.key === 'antennaLength' && !['beetle','bee','wasp','mosquito','fly','butterfly','dragonfly','crab','lobster'].includes(r.kind)) return false;
            if(r.morphology==='worm'){
                if(r.wormType==='roundworm'&&s.key==='segments')return false;
                if(r.wormType!=='goauld'&&['jawOpen','toothSize','finSize'].includes(s.key))return false;
                if(!['goauld','bristleworm'].includes(r.wormType)&&s.key==='appendageLength')return false;
            }
            if(r.kind==='stingray'&&['jawOpen','toothSize','dorsalHeight'].includes(s.key))return false;
            if(s.key==='toothSize')return (r.kind==='shark'&&r.sharkType!=='whaleShark')||r.kind==='anglerfish'||(r.kind==='whale'&&r.whaleType==='orca')||(r.kind==='worm'&&r.wormType==='goauld');
            return true;
        });
        return SLIDERS.filter(s=>common.has(s.key)).concat(formSliders);
    }

    /**
     * A seeded variation on a preset (a random preset when none is named):
     * sliders wander within their natural range. It carries no `anatomy` and
     * no `gear`, so laid over a recipe it leaves those as they were.
     */
    function randomRecipe(seed, kind) {
        let s = (seed >>> 0) || 1;
        const rand = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
        const id = KIND_BY_ID.has(kind) ? kind : KINDS[Math.floor(rand() * KINDS.length)].kind;
        const base = kindRecipe(id);
        let r = Object.assign({}, base, { colors: Object.assign({}, base.colors) });
        for(const variant of variantsFor(r)){const choice=variant.choices[Math.floor(rand()*variant.choices.length)][0];r=withVariant(r,variant.key,choice);}
        const variationBase = r; r = {...r};
        for (const sl of slidersFor(variationBase)) {
            if (sl.key === 'neckAngle' || sl.key === 'headPitch') { r[sl.key] = variationBase[sl.key] + (rand() - 0.5) * 12; continue; }
            if (sl.key === 'size') { r.size = variationBase.size * (0.85 + rand() * 0.3); continue; }
            const [lo, hi] = sl.natural;
            r[sl.key] = clamp(variationBase[sl.key] + (rand() - 0.5) * (hi - lo) * 0.22, lo, hi);
        }
        // Coat: a nudge of the preset's colors in lightness and warmth.
        const nudge = hex => {
            const c = hexRgb(hex), k = 0.85 + rand() * 0.3, w = (rand() - 0.5) * 0.08;
            const v = [c[0] * k + w, c[1] * k, c[2] * k - w].map(x => Math.round(clamp(x, 0, 1) * 255));
            return '#' + v.map(x => x.toString(16).padStart(2, '0')).join('');
        };
        for (const key of ['coat', 'marking', 'light', 'mane']) r.colors[key] = nudge(r.colors[key]);
        r.seed = seed >>> 0;
        const out = normalizeRecipe(r);
        delete out.anatomy;
        delete out.gear;
        return out;
    }

    // ── shapes ─────────────────────────────────────────────────────────────
    /**
     * Every shape carries the same fields in the same order (one object layout keeps the field's hot loop
     * fast): a cone's ends and radii, an ellipsoid's center, radii and axes, its bone, blend, tag and box,
     * and what may be set on it after: cut away, roughened, flattened, its blend narrowed at the midline,
     * an envelope of coat.
     */
    function shape(o) {
        return { type: o.type, a: o.a || null, b: o.b || null, ra: o.ra || 0, rb: o.rb || 0, c: o.c || null, r: o.r || null, m: o.m || 0, mr: o.mr || 0,
            ax: o.ax || null, ay: o.ay || null, az: o.az || null, bone: o.bone, k: o.k, tag: o.tag, lo: o.lo, hi: o.hi,
            cut: false, bump: 0, bumpScale: 12, bumpSeed: 7, fx: 0, x0: 0, fz: 0, z0: 0, mid: null, envelope: false, prof: o.prof || null };
    }
    /**
     * A head lofted from its three views (type 2): along the head's own axis (`az` forward from `c`), each
     * station's cross-section is a superellipse between the side profile's top and bottom, as wide as the top
     * profile says above the middle (`wT`) and below it (`wB`), squarer or rounder by `nT`/`nB` (the front view).
     * `table` samples the profiles at `N` stations from z0 to z1 (head units already scaled to meters);
     * the ends close with a rounded edge `round`. Its field is a conservative distance (never larger than the true one).
     */
    function profileSolid(c, ax, ay, az, table, z0, z1, round, bone, k, tag) {
        let wmax = 0, ymax = -Infinity, ymin = Infinity;
        for (let i = 0; i < table.length; i += 6) { wmax = Math.max(wmax, table[i + 2], table[i + 3]); ymax = Math.max(ymax, table[i]); ymin = Math.min(ymin, table[i + 1]); }
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const x of [-wmax, wmax]) for (const y of [ymin, ymax]) for (const z of [z0, z1]) for (let i = 0; i < 3; i++) {
            const v = c[i] + ax[i] * x + ay[i] * y + az[i] * z; lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v);
        }
        const s = shape({ type: 2, c, ax, ay, az, bone, k: k ?? 0.03, tag, lo, hi, prof: { table, N: table.length / 6, z0, z1, round, inflate: 0 } });
        // Its field can rise a little faster than the distance across a squared corner: blocks are judged by that.
        s.fx = 1.4;
        return s;
    }
    function profileDistance(s, p) {
        const P = s.prof, T = P.table, dx = p[0] - s.c[0], dy = p[1] - s.c[1], dz = p[2] - s.c[2];
        const x = Math.abs(dx * s.ax[0] + dy * s.ax[1] + dz * s.ax[2]), y = dx * s.ay[0] + dy * s.ay[1] + dz * s.ay[2], z = dx * s.az[0] + dy * s.az[1] + dz * s.az[2];
        let t = (z - P.z0) / (P.z1 - P.z0) * (P.N - 1);
        t = t < 0 ? 0 : t > P.N - 1 ? P.N - 1 : t;
        const i = Math.min(P.N - 2, Math.floor(t)), f = t - i, a = i * 6, b = a + 6;
        const top = T[a] + (T[b] - T[a]) * f, bot = T[a + 1] + (T[b + 1] - T[a + 1]) * f;
        const wT = T[a + 2] + (T[b + 2] - T[a + 2]) * f, wB = T[a + 3] + (T[b + 3] - T[a + 3]) * f, nT = T[a + 4] + (T[b + 4] - T[a + 4]) * f, nB = T[a + 5] + (T[b + 5] - T[a + 5]) * f;
        const yc = (top + bot) * 0.5, h = Math.max(1e-6, (top - bot) * 0.5), v = (y - yc) / h;
        const m = v < -0.6 ? 0 : v > 0.6 ? 1 : (v + 0.6) / 1.2, sm = m * m * (3 - 2 * m);
        const w = Math.max(1e-6, wB + (wT - wB) * sm), n = nB + (nT - nB) * sm;
        const q = Math.pow(Math.pow(x / w, n) + Math.pow(Math.abs(v), n), 1 / n);
        const fc = (q - 1) * Math.min(w, h), fe = Math.max(P.z0 - z, z - P.z1);
        return smax(fc, fe, P.round) - P.inflate;
    }
    /** A rounded cone from a (radius ra) to b (radius rb). */
    function cone(a, b, ra, rb, bone, k, tag) {
        const lo = [0, 1, 2].map(i => Math.min(a[i] - ra, b[i] - rb)), hi = [0, 1, 2].map(i => Math.max(a[i] + ra, b[i] + rb));
        return shape({ type: 0, a, b, ra, rb, bone, k: k ?? 0.03, tag, lo, hi });
    }
    /**
     * An ellipsoid at c with radii r along the axes x (side), y (up) and z
     * (forward) of a basis turned to face `forward`, its up toward `upHint`.
     */
    function ellipsoid(c, r, bone, k, tag, forward, upHint) {
        const f = norm(forward || [0, 0, 1]);
        let side = cross(upHint || [0, 1, 0], f);
        if (len(side) < 1e-6) side = cross([0, 0, 1], f);
        if (len(side) < 1e-6) side = [1, 0, 0];
        side = norm(side);
        const up = norm(cross(f, side));
        const m = Math.max(r[0], r[1], r[2]);
        return shape({ type: 1, c, r, m, mr: Math.min(r[0], r[1], r[2]), ax: side, ay: up, az: f, bone, k: k ?? 0.03, tag, lo: sub(c, [m, m, m]), hi: add(c, [m, m, m]) });
    }
    /** The same shape, smoothly cut away from what is built. */
    const cut = s => Object.assign(s, { cut: true });
    /** A cone made `f` times thinner across x about the plane x = x0 (a muscle mass flat against the body). */
    const flatten = (s, x0, f) => Object.assign(s, { fx: f, x0, a: [x0 + (s.a[0] - x0) * f, s.a[1], s.a[2]], b: [x0 + (s.b[0] - x0) * f, s.b[1], s.b[2]] });
    /** The same along z about z0: the cone keeps its ends and their heights, its rounded ends `f` times shorter front to back. */
    const shorten = (s, z0, f) => Object.assign(s, { fz: f, z0, a: [s.a[0], s.a[1], z0 + (s.a[2] - z0) * f], b: [s.b[0], s.b[1], z0 + (s.b[2] - z0) * f] });

    function shapeDistance(s, p) {
        if (s.type === 2) return profileDistance(s, p);
        if (s.type === 1) {
            const dx = p[0] - s.c[0], dy = p[1] - s.c[1], dz = p[2] - s.c[2];
            const x = (dx * s.ax[0] + dy * s.ax[1] + dz * s.ax[2]) / s.r[0];
            const y = (dx * s.ay[0] + dy * s.ay[1] + dz * s.ay[2]) / s.r[1];
            const z = (dx * s.az[0] + dy * s.az[1] + dz * s.az[2]) / s.r[2];
            const k0 = Math.sqrt(x * x + y * y + z * z);
            const k1 = Math.sqrt(x * x / (s.r[0] * s.r[0]) + y * y / (s.r[1] * s.r[1]) + z * z / (s.r[2] * s.r[2]));
            if (k1 < 1e-9) return -s.mr;
            const d = k0 * (k0 - 1) / k1;
            // Outside, the estimate runs short far from a flat ellipsoid: never nearer than its bounding
            // sphere, so a shape past its box (as the mesher culls it) never reaches into a blend. Inside, it
            // runs deep along a long axis: never deeper than the shortest radius allows, so the field never
            // falls faster than the distance and the mesher's far-block test holds.
            return k0 < 1 ? Math.max(d, (k0 - 1) * s.mr) : Math.max(d, Math.sqrt(dx * dx + dy * dy + dz * dz) - s.m);
        }
        // Round cone (Inigo Quilez's exact distance), in the flattened frame of a flat one.
        const px = s.fx ? s.x0 + (p[0] - s.x0) * s.fx : p[0], pz = s.fz ? s.z0 + (p[2] - s.z0) * s.fz : p[2];
        const bax = s.b[0] - s.a[0], bay = s.b[1] - s.a[1], baz = s.b[2] - s.a[2], l2 = bax * bax + bay * bay + baz * baz;
        const pax = px - s.a[0], pay = p[1] - s.a[1], paz = pz - s.a[2];
        if (l2 < 1e-12) return Math.hypot(pax, pay, paz) - Math.max(s.ra, s.rb);
        const rr = s.ra - s.rb, a2 = l2 - rr * rr, il2 = 1 / l2;
        const y = pax * bax + pay * bay + paz * baz, z = y - l2;
        const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
        const x2 = qx * qx + qy * qy + qz * qz, y2 = y * y * l2, z2 = z * z * l2;
        const kk = Math.sign(rr) * rr * rr * x2;
        if (Math.sign(z) * a2 * z2 > kk) return Math.sqrt(x2 + z2) * il2 - s.rb;
        if (Math.sign(y) * a2 * y2 < kk) return Math.sqrt(x2 + y2) * il2 - s.ra;
        return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - s.ra;
    }

    const smin = (a, b, k) => {
        if (k <= 0) return Math.min(a, b);
        const h = Math.max(k - Math.abs(a - b), 0) / k;
        return Math.min(a, b) - h * h * k * 0.25;
    };
    const smax = (a, b, k) => -smin(-a, -b, k);

    /** A shape's distance with its surface roughened (a mane's locks). */
    function bumpedDistance(s, p) {
        const d = shapeDistance(s, p);
        if (!s.bump || d > s.bump * 2) return d;
        const f = s.bumpScale;
        return d - s.bump * (0.5 + 0.5 * fbm(p[0] * f, p[1] * f * 0.6, p[2] * f, s.bumpSeed, 2));
    }

    /** The field at p over a list of shapes: unions first, then cuts; nothing below the floor. */
    function fieldAt(list, p) {
        let d = 1e3;
        for (let i = 0; i < list.length; i++) {
            const s = list[i];
            const v = s.bump ? bumpedDistance(s, p) : shapeDistance(s, p);
            // A limb's wide blend into the trunk narrows toward the midline, so the two legs of a pair never web together.
            let k = s.k;
            if (s.mid) {
                const t = (Math.abs(p[0]) - s.mid[0]) / (s.mid[1] - s.mid[0]);
                if (t < 1) k *= t <= 0 ? s.mid[2] : s.mid[2] + (1 - s.mid[2]) * t * t * (3 - 2 * t);
            }
            d = s.cut ? smax(d, -v, k) : smin(d, v, k);
        }
        return Math.max(d, -p[1]);
    }

    // ── skeleton and layout (units: shoulder-to-hip joint length = 1) ─────
    /**
     * Every joint and landmark of the creature, in body units. The bones are
     * the Rig tool's quadruped bones plus a tail chain.
     */
    function layout(r) {
        const g = r.girth, bl = r.bodyLength, L = r.legLength, ht = r.headSize, lt = r.legThickness, cd = r.chestDepth;
        const plant = r.plantigrade, hoof = r.feet === 'hoof';
        const J = {};
        const zS = 0.5 * bl, zH = -0.5 * bl;
        // Leg tops: the shoulder joint in front, the hip joint behind.
        const yS = 0.86 * L, yH = 0.84 * L * r.hipHeight;
        const halfW = 0.13 * g;
        // A heavy build past the everyday range grows broader faster than it grows deep, so the trunk stays
        // above the legs: `gv` is the girth the trunk's heights follow.
        const gv = g <= 1.3 ? g : 1.3 + (g - 1.3) * 0.45;
        J.shoulder = [halfW, yS, zS];
        J.hip = [halfW, yH, zH];
        // The withers (the shoulder blades' tops), the neck's root at the chest's front, the hips' bone.
        J.withers = [0, yS + 0.44 * gv, zS - 0.17];
        // A heavy chest carries the neck's root forward with it.
        J.neck = [0, yS + 0.22 * gv, zS + 0.07 + 0.1 * Math.max(0, gv - 1)];
        J.hips = [0, yH + 0.12 * gv, zH + 0.06];
        // The breastbone comes down toward the elbows and no further than the legs allow.
        const drop = 0.24 * gv * cd, dropMax = 0.38 * yS;
        const chestTop = yS + 0.36 * gv, chestBottom = yS - (drop <= dropMax ? drop : dropMax + (drop - dropMax) * 0.4);
        // Front leg: the humerus down and back to the elbow, the forearm down to the carpus, the paw ahead of it.
        const wristY = hoof ? yS * 0.36 : yS * (0.22 - 0.17 * plant);
        const hockY = hoof ? yH * 0.42 : yH * (0.33 - 0.27 * plant);
        J.frontKnee = [halfW * 1.1, yS * 0.6, zS - 0.1 * L];
        J.frontAnkle = [halfW * 1.05, wristY, zS - 0.05 * L];
        J.frontToe = [halfW * 1.05, 0, zS + (hoof ? 0.0 : 0.03 * L) + 0.12 * plant];
        // Hind leg: the femur down and forward to the stifle, the tibia down and back to the hock (steeper
        // than it is long back, as a standing animal holds it), the cannon or paw under it. Laid out from
        // the hip's height, so a long or short leg keeps the same angles.
        J.rearKnee = [halfW * 1.15, yH * (hoof ? 0.67 : 0.62), zH + (hoof ? 0.12 : 0.13 * (1 - 0.4 * plant)) * yH];
        J.rearAnkle = [halfW, hockY, zH - (hoof ? 0.07 : 0.1 * (1 - 0.5 * plant)) * yH];
        J.rearToe = [halfW, 0, zH - (hoof ? 0.05 : 0.04) * yH + 0.2 * plant];
        // Neck: from its root out and up at the raise angle.
        const na = r.neckAngle * DEG, nlen = 0.34 * r.neckLength;
        J.atlas = add(J.neck, mul([0, Math.sin(na), Math.cos(na)], nlen));
        // Head: a frame turned down by the tilt; the muzzle runs out of the skull along it.
        const pitch = r.headPitch * DEG;
        const hd = [0, -Math.sin(pitch), Math.cos(pitch)], hu = [0, Math.cos(pitch), Math.sin(pitch)];
        // A heavy build carries a heavier head.
        const sr = 0.15 * ht * (1 + 0.25 * Math.max(0, g - 1.3));
        const skull = add(J.atlas, add(mul(hd, sr * 0.78), mul(hu, sr * 0.22)));
        const sL = r.snoutLength;
        const mL = 0.35 + 0.9 * sL + 0.6 * sL * sL;
        /** A point in the head's frame, in skull radii: x out to the left, y up, z forward. */
        const H = (x, y, z) => [skull[0] + x * sr, skull[1] + (hu[1] * y + hd[1] * z) * sr, skull[2] + (hu[2] * y + hd[2] * z) * sr];
        J.skull = skull; J.hdir = hd; J.hup = hu; J.skullR = sr;
        J.snoutTip = H(0, -0.06, 0.55 + mL);
        J.headTop = H(0, 0.9, 0);
        // Tail: from the croup, out and drooping (carriage below zero) or curling up.
        const tailRoot = [0, yH + 0.27 * gv, zH - 0.21];
        J.tailRoot = tailRoot;
        const tailLen = r.tail === 'none' ? 0 : 1.05 * r.tailLength * (r.tail === 'stub' ? 0.3 : 1);
        const segments = 6;
        const tailPts = [tailRoot];
        let dirAngle = (r.tailCurl * 45 - 18) * DEG;
        const step = tailLen / segments;
        for (let i = 0; i < segments; i++) {
            const last = tailPts[tailPts.length - 1];
            tailPts.push(add(last, [0, Math.sin(dirAngle) * step, -Math.cos(dirAngle) * step]));
            // A drooping tail hangs ever lower, then lifts a little at the end; a carried one curls forward over the back.
            dirAngle += (r.tail === 'curly' ? 70 : r.tailCurl > 0 ? 18 * r.tailCurl : (i < 4 ? 13 : -10) * r.tailCurl * (i < 4 ? 1 : -0.6)) * DEG;
        }
        // A long tail that reaches the ground lies along it.
        for (const p of tailPts) p[1] = Math.max(p[1], 0.04 * r.tailThickness * g);
        J.tail = tailPts;
        // Wings: from the top of the shoulders, held half open, up and back.
        if (r.wings !== 'none' && r.wingSize > 0) {
            const ws = r.wingSize * Math.max(0.8, bl);
            const rootW = [halfW * 0.8, J.withers[1] - 0.03 * g, zS - 0.12];
            const elbow = add(rootW, [0.32 * ws, 0.26 * ws, -0.12 * ws]);
            const wrist = add(elbow, [0.36 * ws, 0.12 * ws, 0.08 * ws]);
            // Finger tips fan from the wrist out, down and back to the flank.
            const tips = [
                add(wrist, [0.42 * ws, 0.08 * ws, -0.1 * ws]),
                add(wrist, [0.38 * ws, -0.18 * ws, -0.32 * ws]),
                add(wrist, [0.2 * ws, -0.36 * ws, -0.5 * ws]),
                add(wrist, [-0.05 * ws, -0.4 * ws, -0.62 * ws])
            ];
            // Where the membrane meets the body: along the flank, from the root back.
            const flank = [0.18 * g, yS + 0.15 * g, -0.35 * bl];
            J.wing = { root: rootW, elbow, wrist, tips, flank };
        }
        return { J, H, sr, mL, hd, hu, zS, zH, yS, yH, halfW, g, bl, L, ht, lt, cd, chestTop, chestBottom,
            gv, spineF: [0, J.withers[1] - 0.02 * gv, J.withers[2]], spineR: [0, yH + 0.32 * gv, zH], toes: [], eyes: [], ears: [], nostrils: [] };
    }

    function bonesOf(lay) {
        const { J } = lay;
        const bones = [];
        const addBone = (name, parent, head, tail) => { bones.push({ name, parent: parent == null ? -1 : bones.findIndex(b => b.name === parent), head, tail }); };
        // Hips, Spine and Chest as the Rig tool lays them: hips to the neck base at 0.4 and 0.75.
        addBone('Hips', null, J.hips, lerp(J.hips, J.neck, 0.4));
        addBone('Spine', 'Hips', lerp(J.hips, J.neck, 0.4), lerp(J.hips, J.neck, 0.75));
        addBone('Chest', 'Spine', lerp(J.hips, J.neck, 0.75), J.neck);
        addBone('Neck', 'Chest', J.neck, J.atlas);
        addBone('Head', 'Neck', J.atlas, J.snoutTip);
        const tail = J.tail;
        if (tail.length > 1 && len(sub(tail[tail.length - 1], tail[0])) > 1e-4) {
            // Three tail bones over the six segments.
            addBone('Tail', 'Hips', tail[0], tail[2]);
            addBone('Tail2', 'Tail', tail[2], tail[4]);
            addBone('Tail3', 'Tail2', tail[4], tail[6]);
        }
        if (J.wing) for (const side of ['Left', 'Right']) {
            const m = side === 'Left' ? same : mirror;
            addBone(side + 'Wing', 'Chest', m(J.wing.root), m(J.wing.wrist));
        }
        for (const side of ['Left', 'Right']) {
            const m = side === 'Left' ? same : mirror;
            addBone(side + 'FrontUpperLeg', 'Chest', m(J.shoulder), m(J.frontKnee));
            addBone(side + 'FrontLowerLeg', side + 'FrontUpperLeg', m(J.frontKnee), m(J.frontAnkle));
            addBone(side + 'FrontFoot', side + 'FrontLowerLeg', m(J.frontAnkle), m([J.frontAnkle[0], 0, J.frontAnkle[2]]));
            addBone(side + 'RearUpperLeg', 'Hips', m(J.hip), m(J.rearKnee));
            addBone(side + 'RearLowerLeg', side + 'RearUpperLeg', m(J.rearKnee), m(J.rearAnkle));
            addBone(side + 'RearFoot', side + 'RearLowerLeg', m(J.rearAnkle), m([J.rearAnkle[0], 0, J.rearAnkle[2]]));
        }
        return bones;
    }

    /** The implicit shapes, each bound to a bone, in body units. */
    function shapesOf(r, lay) {
        const { J, H, sr, mL, hd, hu, zS, zH, yS, yH, halfW, g, gv, bl, lt, cd, chestTop, chestBottom } = lay;
        const S = [];
        const E = (c, rad, bone, k, tag, f, up) => { const s = ellipsoid(c, rad, bone, k, tag, f, up); S.push(s); return s; };
        const C = (a, b, ra, rb, bone, k, tag) => { const s = cone(a, b, ra, rb, bone, k, tag); S.push(s); return s; };
        const prof = profileOf(r);
        const lw = lt * (0.55 + 0.45 * g);
        // ── torso: the rib cage deepest just behind the elbows and narrow across, tapering back along the
        // last ribs; the belly tapering on to a waist tucked up in front of the hips; the croup and buttocks behind.
        // The middle of the trunk follows the spine from the shoulders' height down (or up) to the hips'.
        const spineY = z => yH + (yS - yH) * clamp((z - zH) / (zS - zH), 0, 1);
        const chestR = (chestTop - chestBottom) / 2, chestA = [0, (chestTop + chestBottom) / 2, zS - 0.2 * Math.min(bl, 1.2) + 0.3 * (chestTop - chestBottom) / 2];
        const ribB = zS - 0.55 * bl, ribR = chestR * 0.66 + 0.02 * gv;
        const ribEnd = [0, spineY(ribB) + 0.31 * gv - ribR, ribB];
        // The ribs and the waist are one run of skin: the waist starts as the ribs end, as wide and as deep,
        // and narrows on to the hips, so the underline rises in one sweep.
        const across = chestR / (0.19 * g);
        flatten(C(chestA, ribEnd, chestR, ribR, 'Chest', 0.1 * g, 'torso'), 0, across);
        // A big cat's breastbone stands forward between the forelegs: the chest is keeled, not square.
        if (prof.bigcat) E([0, yS - 0.1 * gv * cd, zS + 0.11], [0.05 * g, 0.17 * gv * cd, 0.07], 'Chest', 0.07 * g, 'torso');
        // The breast between the forelegs: rounded, blended wide on a big cat so the chest's front is one curve.
        for (const s of [1, -1]) E([s * 0.06 * g, yS - 0.05 * gv * cd, zS + 0.05], [0.08 * g, 0.14 * gv * cd, 0.1], 'Chest', (prof.bigcat ? 0.12 : 0.08) * g, 'torso');
        // A cat's spine runs low between its shoulder blades, which stand above it.
        const blades = prof.felid ? 1 : 0;
        flatten(C(add(J.withers, [0, -0.06 * gv - 0.02 * gv * blades, 0.1]), [0, spineY(-0.05 * bl) + (chestTop - 0.04 * gv - yS), -0.05 * bl], 0.07 * gv, 0.09 * gv, 'Chest', 0.12 * g, 'back'), 0, gv / g);
        // The waist: shallow on a lean animal, and a belly (the slider above zero) hangs a gut below it.
        const waist = 0.15 * gv * (1 + 0.6 * clamp(r.belly, -1.2, 0)), wz = zH + 0.2 * bl;
        shorten(flatten(C(ribEnd, [0, yH + 0.3 * gv - waist, wz], ribR, waist, 'Spine', 0.14 * g, 'belly'), 0, across * 0.9), wz, 1.6);
        // On from the waist to the hips, between the thighs, so the loin is whole however high the hips stand.
        flatten(C([0, yH + 0.3 * gv - waist, wz], [0, yH + 0.3 * gv - waist * 0.9, zH + 0.02], waist * 0.95, waist * 0.9, 'Spine', 0.1 * g, 'belly'), 0, across * 0.9);
        // A big cat's loose skin (the primordial pouch) hangs flat along the belly in front of the thighs.
        if (prof.felid) E([0, yH + 0.3 * gv - 2 * waist + 0.04 * gv, wz + 0.12 * bl], [0.09 * g, 0.04 * gv, 0.16 * bl], 'Spine', 0.07 * g, 'belly');
        if (r.belly > 0) {
            const gut = r.belly, gz = (ribB + wz) / 2;
            E([0, spineY(gz) + 0.3 * gv - ribR - 0.04 * gv * gut, gz], [0.15 * g * (1 + 0.18 * gut), (0.16 + 0.06 * gut) * gv, 0.3 * bl], 'Spine', 0.1 * g, 'belly');
        }
        flatten(C([0, spineY(0.05 * bl) + 0.31 * gv, 0.05 * bl], [0, yH + 0.3 * gv, zH + 0.05], 0.1 * gv, 0.115 * gv, 'Spine', 0.12 * g, 'back'), 0, gv / g);
        E([0, yH + 0.22 * gv, zH - 0.03], [0.15 * g, 0.16 * gv, 0.2], 'Hips', 0.08 * g, 'rump');
        E([0, yH + 0.08 * gv, zH - 0.19], [0.12 * g, 0.12 * gv, 0.09], 'Hips', 0.07 * g, 'rump');
        if (r.hump > 0) E(add(J.withers, [0, -0.02 * gv, 0.02]), [0.12 * g, 0.12 * gv * r.hump, 0.2 * Math.max(0.7, bl)], 'Chest', 0.05 * g, 'hump');
        // A rabbit's back arches up into a high, round rump over big folded haunches.
        if (prof.face === 'rabbit') {
            E([0, yH + 0.30 * gv, zH + 0.06], [0.17 * g, 0.21 * gv, 0.27], 'Hips', 0.12 * g, 'rump');
            E([0, (yS + yH) / 2 + 0.33 * gv, (zS + zH) / 2 - 0.04], [0.15 * g, 0.16 * gv, 0.3 * bl], 'Spine', 0.12 * g, 'back');
            for (const sd of [1, -1]) E([sd * 0.12 * g, yH + 0.06 * gv, zH + 0.08], [0.085 * g, 0.17 * gv, 0.19], 'Hips', 0.1 * g, 'rump');
        }
        // ── neck: the column, the crest of muscle over it, the throat under it.
        // A neck past the everyday thickness grows more slowly, so it stays a neck under the head.
        const nk = r.neckThickness <= 1.4 ? r.neckThickness : 1.4 + (r.neckThickness - 1.4) * 0.5;
        const nt = nk * Math.sqrt(g * gv);
        // At the head the neck is never wider than the skull, so it never swallows the face.
        const nb = Math.min(0.115 * nt * Math.sqrt(r.headSize), (r.feet === 'hoof' ? 0.5 : 0.8) * sr) / (0.115 * nt * Math.sqrt(r.headSize));
        C(add(J.neck, [0, -0.02 * g, -0.04]), J.atlas, 0.18 * nt, 0.115 * nt * Math.sqrt(r.headSize) * nb, 'Neck', 0.06 * g, 'neck');
        C([0, J.withers[1] - 0.05 * gv, zS - 0.1], add(J.atlas, mul(hu, 0.05 * nt * nb)), 0.1 * nt, 0.08 * nt * nb, 'Neck', 0.05 * g, 'neck');
        C([0, yS + 0.04 * gv, zS + 0.1], add(J.atlas, [0, -0.06 * nt * nb, 0.02]), 0.1 * nt, 0.07 * nt * nb, 'Neck', 0.05 * g, 'neck');
        // A bull's dewlap: a fold of skin hanging under the throat and down the front of the chest.
        if (prof.face === 'cattle') {
            const a = add(J.atlas, mul(hu, -0.9 * sr)), b = [0, chestBottom + 0.1 * gv, zS + 0.12];
            flatten(C(a, b, 0.07 * nt, 0.12 * nt, 'Neck', 0.08 * g, 'neck'), 0, 3.2);
        }
        // ── head.
        headShapes(r, lay, S, E, C);
        // ── legs. The upper leg lies inside the trunk's skin down to the elbow and the stifle, its muscle
        // flat against the body and blended into it wide (narrowing toward the midline, so a pair never
        // webs together); below, the leg stands free with tighter joints and tendons.
        const ps = r.pawSize;
        const mid = [0.04 * g, 0.12 * g, 0.2];
        const M = s => Object.assign(s, { mid });
        // The upper legs' muscle follows the body's build as much as the leg's.
        const tw = 0.5 * lw + 0.5 * g;
        // Below the elbow and stifle a leg thins only so far, so the thinnest still holds together.
        const ll = Math.max(lw, 0.5 * Math.max(1, 0.9 * g));
        for (const side of [1, -1]) {
            const m = side > 0 ? same : mirror;
            const P = side > 0 ? 'Left' : 'Right';
            const sh = J.shoulder, el = J.frontKnee, wr = J.frontAnkle;
            // The shoulder blade flat on the ribs, up and back from the point of the shoulder to the withers.
            const sTop = [0.1 * g, J.withers[1] - 0.07 * g, zS - 0.22], sLow = add(sh, [0.02 * g, 0.05 * g, 0.03]);
            const sMid = lerp(sLow, sTop, 0.5); sMid[0] = 0.13 * g;
            M(E(m(sMid), [0.035 * g, 0.1 * g, len(sub(sTop, sLow)) / 2 + 0.02], 'Chest', 0.1 * g, 'scapula', m(sub(sTop, sLow))));
            if (blades) E(m([0.07 * g, J.withers[1] - 0.025 * g, zS - 0.19]), [0.035 * g, 0.045 * g, 0.12], 'Chest', 0.1 * g, 'scapula', [0, 0.35, 1]);
            // The upper arm: the point of the shoulder down to the elbow, the triceps filling the angle behind it.
            // A big cat's forequarters are its power: a heavy shoulder, a thick forearm, a broad paw.
            const ax = side * (sh[0] + 0.01 * g), fq = prof.bigcat ? 1.12 : 1, kq = prof.bigcat ? 1.35 : 1;
            M(flatten(C(m(add(sh, [0.01 * g, 0.02, 0.0])), m(add(el, [0, 0.03, 0.0])), 0.085 * tw * fq, 0.05 * tw * fq, P + 'FrontUpperLeg', 0.1 * g * kq, 'upperleg'), ax, 1.5));
            M(flatten(C(m([sh[0], sh[1] + 0.03 * g, sh[2] - 0.13]), m(add(el, [0, 0.025, -0.03 * lw])), 0.075 * tw * fq, 0.045 * tw * fq, P + 'FrontUpperLeg', 0.09 * g * kq, 'upperleg'), ax, 1.45));
            E(m(add(el, [0, 0.01, -0.04 * ll])), [0.032 * ll * fq, 0.038 * ll * fq, 0.034 * ll * fq], P + 'FrontLowerLeg', 0.035 * g, 'lowerleg');
            // The forearm, full of muscle at the top and in front, slim at the carpus.
            C(m(el), m(wr), 0.06 * ll * fq, 0.038 * ll * fq, P + 'FrontLowerLeg', 0.05 * g, 'lowerleg');
            E(m(add(lerp(el, wr, 0.26), [0.003, 0, 0.01 * ll * fq])), [0.055 * ll * fq, 0.058 * ll * fq, Math.max(0.05, len(sub(wr, el)) * (0.34 + 0.06 * (fq - 1) * 5))], P + 'FrontLowerLeg', 0.05 * g, 'lowerleg', m(sub(wr, el)));
            E(m(wr), [0.038 * ll * fq, 0.038 * ll * fq, 0.04 * ll * fq], P + 'FrontFoot', 0.03 * g, 'lowerleg');
            footShapes(r, lay, S, E, C, m, P + 'FrontFoot', wr, J.frontToe, ps * (prof.bigcat ? 1.12 : 1), ll * fq, true, prof);
            const hp = J.hip, st = J.rearKnee, hk = J.rearAnkle;
            // The haunch: one broad mass from the point of the hip to the point of the buttock, tapering down
            // to the stifle; the hamstrings behind it down to the calf; its outside no wider than the ribs.
            const hx = side * halfW * 0.9, femL = len(sub(st, hp));
            M(flatten(C(m([halfW * 0.9, hp[1] + 0.02 * g, hp[2] - 0.04]), m(add(lerp(hp, st, 0.82), [0, 0, -0.005])), 0.11 * tw + 0.12 * femL, 0.06 * tw, P + 'RearUpperLeg', 0.11 * g, 'thigh'), hx, 1.9));
            M(flatten(C(m([halfW * 0.75, yH + 0.03 * g, zH - 0.16]), m(add(lerp(st, hk, 0.3), [0, 0, -0.032 * lw])), 0.07 * tw, 0.04 * lw, P + 'RearUpperLeg', 0.08 * g, 'thigh'), hx, 1.35));
            E(m(add(st, [0.006, 0.01, 0.022 * lw])), [0.038 * lw, 0.04 * lw, 0.036 * lw], P + 'RearLowerLeg', 0.04 * g, 'thigh');
            // The flank's fold: a thin web of skin from the belly down to the front of the stifle, filling the
            // angle between the belly and the thigh.
            const webR = 0.07 * g + 0.05 * femL;
            const fa = [0.115 * g, Math.min(yH + 0.04 * g, yH + 0.3 * g - 2 * waist + webR * 0.7) - Math.max(0, r.belly) * 0.04 * g, wz - 0.03], fb = add(st, [-0.01 * g, 0.03, 0.01]);
            M(flatten(C(m(fa), m(fb), webR, 0.04 * tw, 'Spine', 0.12 * g, 'belly'), side * 0.115 * g, 2.0));
            // The gaskin: the tibia, the calf behind it, the tendon down to the point of the hock.
            C(m(st), m(hk), 0.05 * ll, 0.03 * ll, P + 'RearLowerLeg', 0.04 * g, 'lowerleg');
            E(m(add(lerp(st, hk, 0.3), [0, 0, -0.028 * ll])), [0.038 * ll, 0.044 * ll, Math.max(0.05, len(sub(hk, st)) * 0.3)], P + 'RearLowerLeg', 0.045 * g, 'lowerleg', m(sub(hk, st)));
            C(m(add(lerp(st, hk, 0.55), [0, 0, -0.042 * ll])), m(add(hk, [0, 0.012, -0.036 * ll])), 0.022 * ll, 0.021 * ll, P + 'RearLowerLeg', 0.03 * g, 'lowerleg');
            E(m(hk), [0.031 * ll, 0.033 * ll, 0.035 * ll], P + 'RearFoot', 0.03 * g, 'lowerleg');
            footShapes(r, lay, S, E, C, m, P + 'RearFoot', hk, J.rearToe, ps * 0.92, ll, false, prof);
        }
        // ── a thick coat rounds the trunk over the muscles: one soft mass from the chest to the buttocks
        // and over each haunch, filling the waist and the hollows between shoulder and thigh. It shapes the
        // surface only; skin weights and coat colors come from the shapes under it.
        if (r.fluff > 0.6) {
            const a = clamp((r.fluff - 0.6) / 0.5, 0, 1), top = Math.max(chestTop, yH + 0.3 * gv);
            E([0, (chestBottom + top) / 2 + 0.01 * g, (zS + zH) / 2 - 0.03], [(0.16 + 0.03 * a) * g, (top - chestBottom) / 2 * (0.86 + 0.08 * a), (zS - zH) / 2 + 0.1], 'Spine', 0.09 * g * a, 'torso').envelope = true;
            for (const side of [1, -1]) M(E([side * 0.1 * g, yH + 0.1 * gv, zH - 0.04], [0.11 * g, (0.18 + 0.04 * a) * gv, 0.2], 'Hips', 0.08 * g * a, 'rump')).envelope = true;
        }
        // ── manes: a lion's around the face, down the neck and over the chest; a horse's crest; a ruff at the throat.
        if(r.kind==='cat'&&r.fluff>.6){
            // A long coat has volume before individual guard hairs are added.
            const amount=(r.catType==='persian'?.070:.045)*Math.min(1.6,r.fluff)*g;
            for(const sh of S)if(!sh.cut&&['torso','belly','rump','back','scapula','thigh'].includes(sh.tag)){
                if(sh.type===0){sh.ra+=amount;sh.rb+=amount;for(let k=0;k<3;k++){sh.lo[k]-=amount;sh.hi[k]+=amount;}}
                else if(sh.type===1){sh.r=sh.r.map(v=>v+amount);sh.m=Math.max(...sh.r);sh.mr=Math.min(...sh.r);for(let k=0;k<3;k++){sh.lo[k]-=amount;sh.hi[k]+=amount;}}
            }
        }
        maneShapes(r, lay, S, E, C);
        // ── anatomy: the sheath and scrotum or the vulva, and an udder where the species has one.
        if (r.anatomy && r.anatomy.detail) {
            const first = S.length;
            anatomyShapes(r, lay, S, E, C, prof);
            lay.anatomyShapes = S.splice(first);
        }
        // A fleece: the wool over the trunk, neck and upper legs grows in lumpy locks; the face and the lower
        // legs are bare of it.
        if (prof.face === 'sheep' && r.fluff > 0.3) {
            const woolly = new Set(['torso', 'belly', 'rump', 'back', 'hump', 'neck', 'scapula', 'thigh', 'upperleg']);
            const amt = 0.022 * g * Math.min(1.6, r.fluff);
            for (const sh of S) if (!sh.cut && woolly.has(sh.tag) && sh.bone !== 'Head') Object.assign(sh, { bump: amt, bumpScale: 34 / g, bumpSeed: 37 });
        }
        return S;
    }

    /** The head: cranium, forehead, brows, cheekbones, muzzle, whisker pads, nose pad, jaw and chin, eye sockets. */
    // ── anatomical heads ───────────────────────────────────────────────────
    /**
     * Species heads from their three views, in skull radii along the head's own frame (y up, z forward from the
     * braincase's middle). Each profile is keyed over t: 0 the occiput, 1 the stop (where the forehead meets the
     * bridge of the nose), 2 the nose's front: `top` the side view's upper line (crown, forehead, stop, bridge,
     * nose), `bot` its lower line (throat, jaw angle, jaw, chin, lip), `wT`/`wB` the top view's half widths of the
     * upper and lower halves (braincase and brows; zygomatic arches, cheeks, muzzle), `nT`/`nB` how square the
     * front view's section is above and below. `back` and `stop` place t 0 and 1 (skull radii); the muzzle runs
     * `muzzle` times the Snout length's own reach past the stop. The sub-forms (arches, brows, masseters, the
     * bridge, nasal planum, whisker pads or flews, chin) are small, tightly blended shapes on it.
     */
    const HEAD_PROFILES = {
        bigcat: {
            back: -1.0, stop: 0.55, muzzle: 0.6, round: 0.12, eye: [0.33, 0.34, 0.8],
            top: [[0, 0.15], [0.25, 0.68], [0.55, 0.82], [0.85, 0.74], [1, 0.64], [1.35, 0.54], [1.75, 0.46], [1.92, 0.40], [2, 0.30]],
            bot: [[0, -0.40], [0.3, -0.70], [0.6, -0.84], [0.9, -0.74], [1.2, -0.62], [1.55, -0.56], [1.85, -0.48], [2, -0.36]],
            wT: [[0, 0.46], [0.3, 0.72], [0.6, 0.80], [0.8, 0.66], [1, 0.42], [1.15, 0.32], [1.5, 0.32], [1.8, 0.36], [2, 0.34]],
            wB: [[0, 0.52], [0.3, 0.90], [0.55, 1.06], [0.8, 0.98], [1, 0.76], [1.3, 0.62], [1.65, 0.60], [1.9, 0.56], [2, 0.50]],
            nT: [[0, 2.0], [1, 2.2], [2, 2.1]], nB: [[0, 2.0], [1, 2.2], [2, 2.4]],
            ear: [0.58, 0.58, -0.42], pad: { y: -0.30, z: -0.28 }
        },
        canid: {
            back: -1.05, stop: 0.52, muzzle: 0.72, round: 0.14, eye: [0.30, 0.30, 0.75],
            top: [[0, 0.08], [0.3, 0.56], [0.62, 0.70], [0.88, 0.64], [1, 0.52], [1.15, 0.44], [1.55, 0.38], [1.9, 0.32], [2, 0.26]],
            bot: [[0, -0.36], [0.3, -0.60], [0.6, -0.66], [0.9, -0.60], [1.2, -0.54], [1.6, -0.50], [1.9, -0.44], [2, -0.32]],
            wT: [[0, 0.40], [0.3, 0.64], [0.62, 0.70], [0.88, 0.58], [1, 0.40], [1.2, 0.30], [1.7, 0.27], [2, 0.22]],
            wB: [[0, 0.46], [0.3, 0.76], [0.55, 0.86], [0.85, 0.72], [1, 0.54], [1.25, 0.40], [1.7, 0.34], [2, 0.26]],
            nT: [[0, 2.2], [1, 2.4], [2, 2.2]], nB: [[0, 2.2], [1, 2.2], [2, 2.4]],
            ear: [0.42, 0.62, -0.38], pad: { y: -0.26, z: -0.32 }
        },
        horse: {
            // A deep wedge: broad flat forehead, a big round jaw behind, the face tapering only a little to a deep
            // muzzle that ends in full, rounded lips (not a tube).
            back: -0.95, stop: 0.55, muzzle: 0.84, round: 0.18,
            top: [[0, 0.20], [0.3, 0.58], [0.7, 0.66], [1, 0.60], [1.4, 0.50], [1.75, 0.43], [1.92, 0.36], [2, 0.20]],
            bot: [[0, -0.40], [0.3, -0.92], [0.6, -1.06], [0.9, -0.92], [1.15, -0.68], [1.5, -0.58], [1.8, -0.60], [1.95, -0.50], [2, -0.34]],
            wT: [[0, 0.42], [0.4, 0.66], [0.8, 0.74], [1, 0.64], [1.4, 0.40], [1.8, 0.36], [2, 0.30]],
            wB: [[0, 0.50], [0.35, 0.74], [0.7, 0.72], [1, 0.48], [1.4, 0.32], [1.8, 0.38], [2, 0.32]],
            nT: [[0, 2.4], [1, 3.0], [2, 2.4]], nB: [[0, 2.4], [1, 3.0], [2, 2.4]],
            ear: [0.36, 0.52, -0.55], pad: { y: -0.3, z: -0.3 }
        },
        bear: {
            back: -1.0, stop: 0.48, muzzle: 0.85, round: 0.14,
            top: [[0, 0.15], [0.3, 0.66], [0.62, 0.82], [0.9, 0.72], [1, 0.56], [1.25, 0.40], [1.7, 0.36], [2, 0.26]],
            bot: [[0, -0.40], [0.3, -0.70], [0.6, -0.82], [0.9, -0.72], [1.2, -0.54], [1.6, -0.48], [1.9, -0.42], [2, -0.28]],
            wT: [[0, 0.46], [0.3, 0.80], [0.6, 0.88], [0.9, 0.74], [1, 0.54], [1.3, 0.36], [1.75, 0.32], [2, 0.26]],
            wB: [[0, 0.52], [0.3, 0.92], [0.6, 1.02], [0.9, 0.84], [1, 0.60], [1.3, 0.40], [1.75, 0.34], [2, 0.28]],
            nT: [[0, 2.2], [1, 2.3], [2, 2.3]], nB: [[0, 2.2], [1, 2.2], [2, 2.5]],
            ear: [0.66, 0.66, -0.36], pad: { y: -0.28, z: -0.3 }
        },
        // A nine-banded armadillo: a small flat-topped braincase, then a long narrow snout tapering like a cone
        // to a small round nose, its top line sloping gently down (the head shield lies over it, see loftsOf).
        armadillo: {
            back: -0.9, stop: 0.5, muzzle: 1.25, round: 0.1, eye: [0.36, 0.2, 0.86],
            top: [[0, 0.1], [0.3, 0.5], [0.65, 0.58], [0.9, 0.5], [1, 0.45], [1.3, 0.33], [1.6, 0.23], [1.85, 0.15], [2, 0.07]],
            bot: [[0, -0.34], [0.3, -0.54], [0.6, -0.56], [0.9, -0.46], [1.1, -0.36], [1.4, -0.27], [1.7, -0.2], [1.9, -0.16], [2, -0.09]],
            wT: [[0, 0.4], [0.3, 0.6], [0.6, 0.64], [0.9, 0.5], [1, 0.4], [1.3, 0.27], [1.6, 0.19], [1.85, 0.14], [2, 0.09]],
            wB: [[0, 0.44], [0.3, 0.66], [0.6, 0.7], [0.9, 0.56], [1, 0.44], [1.3, 0.29], [1.6, 0.2], [1.85, 0.15], [2, 0.1]],
            nT: [[0, 2.2], [1, 2.2], [2, 2.0]], nB: [[0, 2.2], [1, 2.2], [2, 2.0]],
            ear: [0.24, 0.5, -0.5], pad: { y: -0.16, z: -0.2 }
        },
        deer: {
            back: -0.95, stop: 0.55, muzzle: 0.95, round: 0.13,
            top: [[0, 0.18], [0.3, 0.52], [0.7, 0.58], [1, 0.50], [1.5, 0.36], [1.85, 0.27], [2, 0.20]],
            bot: [[0, -0.34], [0.3, -0.60], [0.6, -0.62], [0.9, -0.50], [1.2, -0.38], [1.7, -0.34], [2, -0.24]],
            wT: [[0, 0.38], [0.4, 0.58], [0.8, 0.62], [1, 0.50], [1.5, 0.28], [2, 0.22]],
            wB: [[0, 0.44], [0.4, 0.60], [0.8, 0.54], [1, 0.42], [1.5, 0.25], [2, 0.22]],
            nT: [[0, 2.3], [1, 2.6], [2, 2.3]], nB: [[0, 2.3], [1, 2.5], [2, 2.3]],
            ear: [0.58, 0.5, -0.45], pad: { y: -0.28, z: -0.3 }
        }
    };
    /** The profile a kind's head is built from (or none: the shared parametric head). */
    // Only the heads clearly better than before use the three-view solid; big cats, deer and cats keep theirs (2026-10-24 review).
    const headProfileOf = r => ['wolf', 'dog', 'fox'].includes(r.kind) ? 'canid' : r.kind === 'horse' ? 'horse' : r.kind === 'bear' ? 'bear' : r.kind === 'armadillo' ? 'armadillo' : null;
    /** Hermite through keyed values (tangents from the neighbours). */
    function keyed(keys, t) {
        if (t <= keys[0][0]) return keys[0][1];
        const n = keys.length;
        if (t >= keys[n - 1][0]) return keys[n - 1][1];
        let i = 0; while (i < n - 2 && t > keys[i + 1][0]) i++;
        const [t0, v0] = keys[i], [t1, v1] = keys[i + 1], dt = t1 - t0, u = (t - t0) / dt;
        const m0 = i > 0 ? (v1 - keys[i - 1][1]) / (t1 - keys[i - 1][0]) * dt : v1 - v0;
        const m1 = i + 2 < n ? (keys[i + 2][1] - v0) / (keys[i + 2][0] - t0) * dt : v1 - v0;
        const u2 = u * u, u3 = u2 * u;
        return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * m1;
    }
    /**
     * The anatomical head: the lofted three-view solid, then the species' sub-forms, tightly blended so the bony
     * planes stay. Returns the nose's front `zt` (skull radii) for the eyes, nostrils and mouth that follow.
     */
    function anatomicalHead(r, lay, id, e, c, head, B, S) {
        const { H, sr, hd, hu, mL, J } = lay, P = HEAD_PROFILES[id], sw = r.snoutWidth;
        const zb = P.back, zs = P.stop, zt = zs + Math.max(0.25, P.muzzle * mL);
        const N = 56, table = new Float32Array(N * 6);
        for (let i = 0; i < N; i++) {
            const z = zb + (zt - zb) * i / (N - 1), t = z < zs ? (z - zb) / (zs - zb) : 1 + (z - zs) / (zt - zs);
            // Snout width widens the muzzle (and a little the cheeks), not the braincase.
            const wk = 1 + (sw - 1) * smooth(0.75, 1.3, t);
            table.set([keyed(P.top, t) * sr, keyed(P.bot, t) * sr, keyed(P.wT, t) * sr * wk, keyed(P.wB, t) * sr * wk, keyed(P.nT, t), keyed(P.nB, t)], i * 6);
        }
        const solid = profileSolid(J.skull, [1, 0, 0], hu, hd, table, zb * sr, zt * sr, P.round * sr, B, 0.05 * sr, 'skull');
        head.push(solid); S.push(solid);
        const at = t => t < 1 ? zb + (zs - zb) * t : zs + (zt - zs) * (t - 1);
        const topAt = t => keyed(P.top, t), botAt = t => keyed(P.bot, t);
        if (id === 'bigcat') {
            for (const s of [1, -1]) {
                // The zygomatic arch: a strong bar of bone from under the eye back toward the ear, flaring the face wide.
                c(H(s * 0.66, -0.02, at(0.95)), H(s * 0.92, -0.08, at(0.45)), 0.11, 0.13, 0.06, 'cheek');
                // The brow ridge over each eye, heavy and straight, ending in the skull rather than as a knob.
                c(H(s * 0.16, topAt(0.98) - 0.1, at(0.98)), H(s * 0.46, topAt(0.85) - 0.24, at(0.82)), 0.08, 0.06, 0.08, 'brow');
                // The masseter over the jaw's angle, below and behind the arch.
                e(H(s * 0.68, -0.5, at(0.55)), [0.22, 0.3, 0.34], 0.14, 'jaw');
                // Whisker pads: broad, firm, part of the muzzle's front corners.
                e(H(s * 0.22 * sw, botAt(1.75) + 0.30, zt - 0.3), [0.2 * sw, 0.17, 0.22], 0.09, 'whisker');
            }
            // The bridge of the nose: broad and straight from the stop to the nose.
            c(H(0, topAt(1.05) - 0.14, at(1.05)), H(0, topAt(1.75) - 0.12, at(1.75)), 0.15 * sw, 0.1 * sw, 0.06, 'snout');
            // The chin: a firm knob under the lower lip, behind the upper lip.
            e(H(0, botAt(1.7) + 0.06, zt - 0.36), [0.18 * sw, 0.11, 0.15], 0.05, 'chin');
        } else if (id === 'canid') {
            const fox = r.kind === 'fox' ? 1 : 0;
            for (const s of [1, -1]) {
                c(H(s * 0.5, -0.02, at(0.92)), H(s * 0.70, -0.1, at(0.42)), 0.09, 0.10, 0.05, 'cheek');
                c(H(s * 0.14, topAt(0.96) - 0.05, at(1.0)), H(s * 0.42, topAt(0.8) - 0.1, at(0.78)), 0.07, 0.06, 0.05, 'brow');
                e(H(s * 0.55, -0.42, at(0.55)), [0.18, 0.24, 0.3], 0.08, 'jaw');
                // The flews: the upper lips' loose rear corners hanging over the lower jaw toward the mouth's corner.
                c(H(s * 0.24 * sw, botAt(1.4) + 0.08, at(1.35)), H(s * 0.18 * sw, botAt(1.85) + 0.1, zt - 0.14), 0.08 * (1 - 0.3 * fox), 0.07, 0.05, 'whisker');
            }
            c(H(0, topAt(1.12) - 0.1, at(1.12)), H(0, topAt(1.8) - 0.1, at(1.8)), 0.11 * sw, 0.08 * sw, 0.05, 'snout');
            e(H(0, botAt(1.75) + 0.05, zt - 0.32), [0.12 * sw, 0.09, 0.14], 0.05, 'chin');
        } else if (id === 'horse') {
            for (const s of [1, -1]) {
                // The jowl: the round flat plate of the cheek over the lower jaw's angle.
                e(H(s * 0.52, -0.64, at(0.55)), [0.2, 0.5, 0.5], 0.1, 'cheek');
                // The facial crest: a low bony ridge running forward under the eye, sunk into the face.
                c(H(s * 0.46, -0.18, at(0.9)), H(s * 0.34, -0.28, at(1.2)), 0.05, 0.03, 0.12, 'cheek');
                // The supraorbital process over the eye.
                c(H(s * 0.30, topAt(0.85) - 0.1, at(0.95)), H(s * 0.5, topAt(0.75) - 0.16, at(0.78)), 0.08, 0.06, 0.08, 'brow');
            }
            // The muzzle: soft round lips, the upper fuller, the chin below.
            e(H(0, botAt(1.9) + 0.24, zt - 0.18), [0.36 * sw, 0.3, 0.24], 0.08, 'snout');
            // The lower lip: firm, closed against the upper, then the chin's soft knob behind it.
            e(H(0, botAt(1.9) + 0.06, zt - 0.22), [0.27 * sw, 0.11, 0.2], 0.06, 'chin');
            e(H(0, botAt(1.75) + 0.02, zt - 0.38), [0.2 * sw, 0.12, 0.16], 0.08, 'chin');
        } else if (id === 'bear') {
            for (const s of [1, -1]) {
                c(H(s * 0.58, -0.02, at(0.9)), H(s * 0.82, -0.08, at(0.45)), 0.11, 0.13, 0.07, 'cheek');
                e(H(s * 0.66, -0.4, at(0.5)), [0.26, 0.32, 0.36], 0.1, 'jaw');
            }
            c(H(0, topAt(1.1) - 0.12, at(1.1)), H(0, topAt(1.8) - 0.12, at(1.8)), 0.14 * sw, 0.1 * sw, 0.06, 'snout');
            e(H(0, botAt(1.75) + 0.06, zt - 0.3), [0.16 * sw, 0.1, 0.14], 0.05, 'chin');
        } else if (id === 'deer') {
            for (const s of [1, -1]) {
                e(H(s * 0.46, -0.5, at(0.55)), [0.13, 0.32, 0.36], 0.05, 'cheek');
                c(H(s * 0.46, -0.12, at(0.9)), H(s * 0.34, -0.22, at(1.25)), 0.05, 0.03, 0.1, 'cheek');
                c(H(s * 0.28, topAt(0.85) - 0.1, at(0.95)), H(s * 0.46, topAt(0.75) - 0.15, at(0.8)), 0.07, 0.05, 0.08, 'brow');
            }
            e(H(0, botAt(1.9) + 0.2, zt - 0.14), [0.24 * sw, 0.2, 0.16], 0.05, 'snout');
        }
        // The nasal planum (nose leather) at the muzzle's front, narrowing down to the philtrum (a hoofed face's
        // nostrils are cut into its muzzle below).
        if (id !== 'horse' && id !== 'deer') {
            e(H(0, topAt(1.97) - 0.1, zt - (id === 'bigcat' ? 0.05 : 0.04)), [(id === 'bigcat' ? 0.2 : id === 'bear' ? 0.24 : 0.19) * sw, id === 'bigcat' ? 0.11 : 0.13, 0.11], 0.03, 'nosepad');
            const back = id === 'bigcat' ? 0.07 : 0.08;
            c(H(0, topAt(1.97) - 0.12, zt - back), H(0, topAt(1.97) - 0.28, zt - back - 0.02), (id === 'bigcat' ? 0.1 : 0.08) * sw, 0.035, 0.025, 'nosepad');
        }
        lay.whiskerPad = { y: P.pad.y, z: zt + P.pad.z };
        J.snoutTip = H(0, topAt(1.97) - 0.1, zt);
        return { zt, ear: P.ear, noseY: topAt(1.97) - 0.1, eye: P.eye ? [P.eye[0], P.eye[1], at(P.eye[2])] : null, eyeOut: P.eyeOut || 0 };
    }

    function headShapes(r, lay, S, E, C) {
        if(r.kind==='cat'){catHeadShapes(r,lay,S,E,C);return;}
        const { H, sr, mL, hd, hu, J } = lay;
        const sw = r.snoutWidth;
        const long = clamp((r.snoutLength - 0.6) / 0.8, 0, 1.6), cat = 1 - Math.min(1, long), felid = profileOf(r).felid ? 1 : 0;
        const gentle = r.kind === 'cat' ? 1 : 0;
        const z0 = 0.55; let zt = z0 + mL;
        const B = 'Head';
        const head = [];
        const e = (c, rad, k, tag) => { const s = E(c, rad.map(v => v * sr), B, k * sr, tag, hd, hu); head.push(s); return s; };
        const c = (a, b, ra, rb, k, tag) => { const s = C(a, b, ra * sr, rb * sr, B, k * sr, tag); head.push(s); return s; };
        if (profileOf(r).face === 'bird') { birdHead(r, lay, S, e, c, head); return; }
        // Species with an anatomical head are lofted from their three views; the rest keep the parametric head.
        const anatomy = headProfileOf(r), A = anatomy ? anatomicalHead(r, lay, anatomy, e, c, head, B, S) : null;
        if (A) zt = A.zt;
        // A grazer's braincase is narrow behind wide jowls.
        const disc = profileOf(r).face === 'pig' ? 1 : 0, grazer = r.feet === 'hoof' && !disc && long > 0.3 ? 1 : 0, hoofFace = grazer === 1;
        const reptile = profileOf(r).face === 'reptile', deep = 0.72 + 0.28 * Math.min(1, mL / 1.25);
        if (!A) {
        // The braincase behind the eyes, the forehead flat and broad over them, the brows, the cheekbones.
        const roundCat=gentle&&['persian','britishShorthair','ragamuffin'].includes(r.catType),wedgeCat=gentle&&r.catType==='siamese';
        e(H(0, 0.08, -0.14), [0.84 - 0.2 * grazer+(roundCat?.10:gentle?.035:0)-(wedgeCat?.08:0), gentle?.84:.72, 0.95], 0.2, 'skull');
        e(H(0, gentle?.43:.36, 0.34), [gentle?.62:.54, gentle?.31:.27, 0.48], 0.18, 'skull');
        for (const s of [1, -1]) {
            // A cat's brow juts over the eye and hoods it.
            if(!gentle)e(H(s * (0.33 - 0.02 * felid), 0.3 - 0.03 * felid, 0.62 + 0.05 * felid), [0.27 + 0.04 * felid, (0.13 + 0.03 * felid), 0.22 + 0.04 * felid], 0.1, 'brow');
            // A long face's cheekbone runs low along the face below the eye, not up under it.
            e(H(s * (0.54 - 0.14 * Math.min(1, long)), -0.16 - 0.14 * Math.min(1, long), 0.2 + 0.15 * long), [0.29 + 0.06 * gentle, 0.27 + 0.02 * long + 0.04 * gentle, 0.52 + 0.2 * long], 0.3, 'cheek');
            if (long > 0.35) e(H(s * 0.42, -0.5, 0.05), [0.3, 0.45, 0.55].map(v => v * Math.min(1, long)), 0.2, 'cheek');
        }
        // The muzzle and the bridge of the nose over it, straight and broad from the brows to the nose; a
        // cat's short muzzle wider than it is deep, square in front.
        c(H(0, -0.04, z0), H(0, -0.13, zt - 0.3), (0.5 - 0.06 * Math.min(1, long)) * sw * (1 - 0.25 * cat), (0.39 - 0.12 * Math.min(1, long)) * sw * (1 - 0.25 * cat), 0.16, 'snout');
        // (A small cat's short face has a small muzzle; a big cat's a deep one.)
        if (cat > 0) e(H(0, -0.16 * deep, (z0 + zt) / 2 + 0.04), [0.47 * sw * deep, 0.42 * deep, (zt - z0) / 2 + 0.06].map(v => v * (0.75 + 0.25 * cat)), 0.16, 'snout');
        c(H(0, 0.3, z0 + 0.05), H(0, 0.12, zt - 0.17), 0.28 * sw, 0.21 * sw, 0.14, 'snout');
        // The upper lips either side of the philtrum, full over the whisker beds and hanging past the chin.
        // A rabbit's whisker beds are small, tucked under its nose.
        const pad = (0.75 + 0.25 * cat) * (1 - 0.2 * gentle) * (hoofFace ? 0.8 : 1) * (profileOf(r).face === 'rabbit' ? 0.72 : 1) * (disc ? 0.78 : 1);
        // A big cat's pads are broad and long, set out to the sides, so the muzzle is square from the front.
        const bigPad = profileOf(r).bigcat ? 1 : 0;
        for (const s of [1, -1]) e(H(s * (0.21 + 0.04 * bigPad) * sw, -0.28 - 0.04 * cat * deep, zt - 0.3 - 0.06 * bigPad), [0.28 * sw * pad * (0.85 + 0.15 * deep), (0.3 + 0.04 * cat) * pad * deep, 0.34 + 0.12 * bigPad], 0.16, 'whisker');
        if (bigPad) e(H(0, -0.33, zt - 0.22), [0.36 * sw, 0.22, 0.24], 0.14, 'whisker');
        lay.whiskerPad = { y: -0.28 - 0.04 * cat * deep, z: zt - 0.3 - 0.06 * bigPad };
        // The nose leather set into the muzzle's end, broad and flat on top; a boar's flat disc.
        if (hoofFace) e(H(0, -0.1, zt - 0.14), [0.4 * sw, 0.36, 0.3].map(v => v * (profileOf(r).face === 'deer' ? 0.78 : 1)), 0.12, 'snout');
        if (disc) {
            // A pig's snout: a forward cylinder of near-even girth ending in a flat, round-to-oval disc (the
            // rhinarium) standing a little proud of it as a rim; a boar's disc is wider than tall, a pig's rounder.
            const dr = 0.25 * sw, dh = r.kind === 'boar' ? 0.21 : 0.25;
            c(H(0, -0.03, zt - 0.45), H(0, 0.0, zt - 0.16), dr * 1.04, dr, 0.08, 'snout');
            // The disc's flat face and crisp rim are lofted on top of it (loftsOf), finer than the body's surface resolves.
            lay.pigDisc = { z: zt + 0.0, rx: dr * 1.1, ry: dh, holeX: 0.11 * sw };
            // A boar's head is a long wedge: the straight forehead line tapering all the way down to the disc.
            if (r.kind === 'boar') c(H(0, 0.48, 0.05), H(0, 0.16, zt - 0.16), 0.3 * sw, 0.2 * sw, 0.12, 'snout');
            if (r.kind === 'pig') {
                // A pig's head is short and deep: the forehead runs in one straight line down to the disc, heavy
                // jowls hang under the jaw and merge into the neck.
                c(H(0, 0.52, 0.1), H(0, 0.2, zt - 0.12), 0.34 * sw, 0.24 * sw, 0.14, 'snout');
                for (const s of [1, -1]) e(H(s * 0.42, -0.42, 0.02), [0.4, 0.46, 0.55], 0.22, 'cheek');
                e(H(0, -0.55, -0.05), [0.42, 0.34, 0.5], 0.2, 'jaw');
            }
        } else if (!reptile) e(H(0, 0.04, zt), [(0.22 + 0.04 * felid - 0.085 * gentle) * sw * (hoofFace ? 0.7 : 1), (0.12 - 0.015 * felid - 0.025 * gentle), 0.12], 0.05, 'nosepad');
        // A paw animal's leather narrows down to the philtrum: a rounded triangle seen from the front.
        if (!disc && !hoofFace && !reptile) c(H(0, 0.03, zt - 0.03), H(0, -0.12, zt - 0.05), (0.13 - 0.04 * gentle) * sw, 0.035, 0.025, 'nosepad');
        // A rabbit's nose is a small Y: two slanting slits meeting over the cleft lip.
        if (profileOf(r).face === 'rabbit') for (const s of [1, -1]) c(H(0, -0.04, zt - 0.02), H(s * 0.14 * sw, 0.08, zt - 0.06), 0.035, 0.03, 0.02, 'nosepad');
        // A reptile's head: heavy brow ridges over the eyes running back over the skull, the jaw's line
        // standing out along the lips, a scaled knob over each nostril at the snout's tip.
        if (reptile) {
            for (const s of [1, -1]) {
                c(H(s * 0.34, 0.4, 0.68), H(s * 0.42, 0.42, -0.35), 0.21, 0.12, 0.07, 'brow');
                c(H(s * 0.42, -0.36, 0.1), H(s * 0.2 * sw, -0.4, zt - 0.2), 0.12, 0.07, 0.06, 'jaw');
                // The jaw's closing muscle bulges behind and below the eye, the cheek plate over it.
                e(H(s * 0.52, -0.18, -0.15), [0.26, 0.3, 0.38], 0.12, 'cheek');
                e(H(s * 0.12 * sw, 0.12, zt - 0.12), [0.13, 0.1, 0.16], 0.06, 'snout');
            }
        }
        }
        // A paw animal's philtrum: a groove down the front of the muzzle from the nose to the lip, set where
        // the muzzle's front stands.
        if (!hoofFace && !disc && !reptile && r.kind !== 'armadillo') {
            const front = y => { const from = H(0, y, zt - 0.7); for (let i = 0; i < 60; i++) { const p = add(from, mul(hd, i * sr * 0.025)); if (fieldAt(head, p) > 0) return p; } return H(0, y, zt); };
            const a = front(-0.08), b = front(-0.36);
            // A rabbit's upper lip is split from the nose down: a deep cleft.
            const split = profileOf(r).face === 'rabbit' ? 1 : 0;
            S.push(cut(cone(add(a, mul(hd, 0.005 * sr)), add(b, mul(hd, (0.005 - 0.03 * split) * sr)), (0.032 + 0.012 * split) * sr, (0.026 + 0.02 * split) * sr, B, 0.035 * sr, 'snout')));
            lay.philtrum = [a, b];
        }
        // A long grazing face is bone under thin skin: the cheek's flat muscle plate behind the jaw with a clear
        // front edge, the facial crest running forward under the eye, a narrow bony bridge down the nose, and
        // the hollow above each eye.
        const faceKind = profileOf(r).face;
        // A canid's skull: broad behind the eyes where the cheekbones (zygomatic arches) flare, the forehead
        // rising over the eyes in a clear stop above the bridge of the nose (a fox's slight, a wolf's strong).
        if (!A && ['wolf', 'dog', 'fox'].includes(r.kind)) {
            const k = r.kind === 'fox' ? 0.6 : r.kind === 'wolf' ? 1.15 : 1;
            for (const s of [1, -1]) e(H(s * (0.5 + 0.06 * k), -0.02, 0.0), [0.3 * k, 0.26, 0.42], 0.22, 'cheek');
            e(H(0, 0.42, 0.42), [0.42 + 0.06 * k, 0.24 * k, 0.32], 0.16, 'skull');
            for (const s of [1, -1]) e(H(s * 0.24, 0.36, 0.56), [0.2, 0.15 * k, 0.2], 0.1, 'brow');
        }
        if (!A && faceKind === 'bear') {
            // A bear's face is broad: full furred cheeks behind the eyes, a wide brow.
            for (const s of [1, -1]) e(H(s * 0.6, -0.15, -0.1), [0.42, 0.45, 0.55], 0.25, 'cheek');
            e(H(0, 0.38, 0.1), [0.7, 0.28, 0.5], 0.2, 'skull');
        }
        if (faceKind === 'rabbit') {
            // Round full cheeks, a soft muzzle that pouts under the nose.
            for (const s of [1, -1]) e(H(s * 0.48, -0.2, 0.32), [0.36, 0.36, 0.45], 0.2, 'cheek');
            e(H(0, -0.14, zt - 0.24), [0.2 * sw, 0.18, 0.14], 0.14, 'snout');
        }
        if (faceKind === 'sheep') {
            // The Roman nose: the bridge arched from the brow to the nostrils.
            e(H(0, 0.24, (z0 + zt) / 2 - 0.05), [0.24 * sw, 0.16, (zt - z0) / 2 + 0.05], 0.12, 'snout');
        }
        if (faceKind === 'cattle') {
            // Broad and flat across the forehead between the horns, a curly poll on top, a wide square muzzle.
            e(H(0, 0.5, 0.15), [0.72, 0.16, 0.55], 0.12, 'skull');
            Object.assign(e(H(0, 0.72, -0.15), [0.5, 0.14, 0.3], 0.1, 'skull'), { bump: 0.05 * sr, bumpScale: 2.5 / sr, bumpSeed: 23 });
            e(H(0, -0.18, zt - 0.2), [0.5 * sw, 0.36, 0.26], 0.12, 'snout');
        }
        if (hoofFace && !A) {
            // A deer's face is fine: light jowls, a slim bridge.
            const fine = faceKind === 'deer' ? 0.6 : 1;
            for (const s of [1, -1]) {
                e(H(s * (0.5 + 0.05 * fine), -0.62, 0.05), [0.16 * fine, 0.46 * (0.8 + 0.2 * fine), 0.46], 0.07, 'cheek');
                c(H(s * 0.47, -0.2, 0.0), H(s * 0.36, -0.28, z0 + 0.45), 0.075 * fine, 0.04 * fine, 0.05, 'cheek');
                if (faceKind !== 'deer') S.push(cut(ellipsoid(H(s * 0.4, 0.5, 0.05), [0.13, 0.11, 0.15].map(v => v * sr), B, 0.08 * sr, 'skull', hd, hu)));
            }
            c(H(0, 0.38, z0 - 0.05), H(0, 0.16, zt - 0.32), 0.17 * sw, 0.13 * sw, 0.06, 'snout');
            if (r.kind === 'horse') {
                // A horse's head: a broad flat forehead between eyes set wide at the sides, the big round plate of the
                // jowl (the masseter over the lower jaw's angle) at the back of the cheek, the facial crest along it,
                // and the muzzle's soft round lips and chin.
                e(H(0, 0.36, 0.18), [0.66, 0.24, 0.5], 0.14, 'skull');
                for (const s of [1, -1]) {
                    e(H(s * 0.5, -0.6, -0.12), [0.18, 0.6, 0.62], 0.12, 'cheek');
                    c(H(s * 0.55, -0.12, -0.25), H(s * 0.42, -0.3, z0 + 0.5), 0.07, 0.04, 0.05, 'cheek');
                }
                e(H(0, -0.2, zt - 0.22), [0.42 * sw, 0.36, 0.3], 0.1, 'snout');
                e(H(0, -0.5, zt - 0.3), [0.3 * sw, 0.16, 0.24], 0.08, 'chin');
            }
        }
        // The nostrils, set into the surface where it stands: a hoofed long face's wide and tall on the
        // muzzle's front corners; a boar's two holes in its disc; a paw animal's small, in the pad.
        const hoofed = hoofFace;
        for (const s of [1, -1]) {
            const facing = hoofed ? norm(add(mul(hd, 0.75), [s * (r.kind === 'horse' ? 0.8 : 0.66), 0, 0])) : norm(add(hd, [s * (disc ? 0.08 : 0.3), 0, 0]));
            const from = hoofed ? (r.kind === 'horse' ? H(s * 0.17 * sw, 0.04, zt - 0.16) : H(s * 0.1 * sw, -0.02, zt - 0.12)) : H(s * (disc ? 0.11 : 0.07) * sw, A ? A.noseY - 0.02 : disc ? 0.0 : 0.01, zt - 0.05 + 0.12 * disc);
            let at = null;
            for (let i = 0; i < 40; i++) {
                const p = add(from, mul(facing, i * sr * 0.02));
                if (fieldAt(head, p) > 0) { at = p; break; }
            }
            if (!at) continue;
            const nr = (gentle ? [0.025, 0.014, 0.037] : hoofed ? (r.kind === 'horse' ? [0.075, 0.15, 0.08] : [0.1, 0.21, 0.16]) : disc ? [0.06, 0.08, 0.1] : [0.045, 0.035, 0.07]).map(v => v * sr * Math.sqrt(sw));
            const tilt = hoofed ? add(hu, [s * -0.35, 0, 0]) : hu;
            // A long face's nostril flares: a rim of skin round its outer side, the opening curling in above it.
            if (hoofed) {
                const rim = E(add(at, add(mul(facing, -nr[2] * 0.25), add([s * nr[0] * 0.9, 0, 0], mul(hu, -nr[1] * 0.15)))), [nr[0] * 0.75, nr[1] * 1.05, nr[2] * 0.8], B, nr[0] * 0.6, 'snout', facing, tilt);
                head.push(rim);
            }
            const hole = cut(ellipsoid(sub(at, mul(facing, nr[2] * 0.55)), nr, B, nr[0] * 0.5, 'nosepad', facing, tilt));
            S.push(hole);
            lay.nostrils.push({ shape: hole, R: nr[0] });
        }
        // The lower jaw from its angle to the chin, and the floor between its halves.
        // A big cat's jaw is deep and heavy; a small cat's light.
        const jawD = cat * clamp((deep - 0.72) / 0.28, 0, 1);
        if (!A) for (const s of [1, -1]) c(H(s * 0.5, -0.42 - 0.04 * jawD, -0.05), H(s * 0.13 * sw, -0.52 - 0.04 * jawD, zt - 0.44), 0.2 + 0.03 * jawD, 0.12 + 0.03 * jawD, 0.12, 'jaw');
        if (!A) e(H(0, -0.54 - 0.05 * jawD, zt - 0.46), [0.2 * sw, 0.14 + 0.03 * jawD, 0.17], 0.12, 'chin');
        if (!A) e(H(0, -0.48 + 0.04 * gentle, 0.2), [0.36 - 0.06 * gentle, 0.22 - 0.06 * gentle, 0.45 - 0.09 * gentle], 0.2, 'jaw');
        // The eyes: out from the skull along their facing, to the surface, set into sockets cut around them.
        const eyeR = (0.15 + 0.025 * gentle) * sr * r.eyeSize;
        const side = r.eyeSide;
        for (const s of [1, -1]) {
            const look = norm(add(mul([s * (0.36 + 0.6 * side), 0, 0], 1), add(mul(hu, 0.12), mul(hd, 0.92 - 0.62 * side))));
            const from = A && A.eye ? H(s * A.eye[0], A.eye[1], A.eye[2]) : H(s * (0.18 + 0.2 * side), 0.17+gentle*.055, 0.42 - 0.2 * side + 0.1 * long);
            // An anatomical head's socket is found out to the side and forward (the face's front lies far ahead of the eye).
            const march = A && A.eye ? norm(add([s * (0.15 + 0.6 * side + (A.eyeOut || 0)), 0, 0], add(mul(hu, 0.04), mul(hd, 0.9)))) : look;
            // There the eye looks out between its socket's opening and its own line of sight.
            const facing = A && A.eye ? norm(add(march, look)) : look;
            // Out to where the skin stands, whatever lies over the face there (a thick neck, a mane's root).
            const built = S.filter(q => !q.cut);
            let at = from;
            for (let i = 0; i < 80; i++) {
                const p = add(from, mul(march, i * sr * 0.025));
                if (fieldAt(head, p) > 0 && fieldAt(built, p) > 0) { at = p; break; }
            }
            // The eye sits back in its socket, its front at the face's surface; the lids close round it in an
            // almond, the outer corner a little higher, their edges crisp.
            const center = sub(at, mul(facing, eyeR * (0.95 + 0.13 * gentle)));
            const lids = cut(ellipsoid(add(center, mul(facing, eyeR * 0.6)), [eyeR * (1.02 + 0.12 * hoofFace), eyeR * (0.64 - 0.1 * felid - 0.1 * hoofFace + 0.29 * gentle), eyeR * 0.75], B, eyeR * 0.28, 'skull', facing, add(hu, [s * (0.22 + 0.12 * felid - 0.30 * gentle), 0, 0])));
            S.push(lids);
            // The tear line's course: from the inner corner of the eye down along the side of the nose's bridge
            // to the top of the whisker pad, laid on the skin (found from inside, out across and up).
            const corner = add(add(center, mul(facing, eyeR * 0.85)), [-s * eyeR * 0.95, 0, 0]);
            const cy = dot(sub(corner, J.skull), hu) / sr, cz = dot(sub(corner, J.skull), hd) / sr, cx = Math.abs(corner[0] - J.skull[0]) / sr;
            const padTop = [0.3 * sw, -0.14, zt - 0.38];
            const tear = [];
            for (let k = 0; k <= 6; k++) {
                const t = k / 6, e2 = t * t * (3 - 2 * t);
                const hx = cx + (padTop[0] - cx) * t, hy = cy + (padTop[1] - cy) * e2, hz = cz + (padTop[2] - cz) * t;
                const inside = H(s * hx * 0.5, hy - 0.15, hz), out = norm(add([s * 0.75, 0, 0], mul(hu, 0.65)));
                let q = H(s * hx, hy, hz);
                for (let i = 0; i < 80; i++) { const pp = add(inside, mul(out, i * sr * 0.01)); if (fieldAt(head, pp) > 0) { q = pp; break; } }
                tear.push(k === 0 ? corner : q);
            }
            lay.eyes.push({ center, facing, R: eyeR, side: s, lids, tear });
        }
        // The ears' roots on the skull.
        // A deer's ears are set low and wide behind its antlers.
        // A bear's small round ears stand far apart on the top of its broad head; a sheep's stand out sideways below its horns.
        for (const s of [1, -1]) lay.ears.push({ base: A ? H(s * A.ear[0], A.ear[1], A.ear[2]) : faceKind === 'deer' ? H(s * 0.58, 0.5, -0.45) : faceKind === 'bear' ? H(s * 0.64, 0.6, -0.35) : faceKind === 'sheep' ? H(s * 0.58, 0.18, -0.3) : H(s * 0.52, 0.66, -0.3), side: s });
        J.mouth = { z0, zt };
        lay.headShapes = head;
    }

    /** Breed anatomy changes the skull and muzzle, not just a common cat's overall size. */
    function catHeadShapes(r,lay,S,E,C){
        const {H,sr,hd,hu,J}=lay,breed=r.catType||'domesticShorthair';
        const profiles={
            domesticShorthair:{w:.81,h:.77,d:.81,nose:1.02,ny:.01,cheek:.27,pad:.27,ey:.18,lid:.76},
            ragamuffin:{w:.89,h:.80,d:.84,nose:1.02,ny:.02,cheek:.39,pad:.30,ey:.20,lid:.91},
            ragdoll:{w:.83,h:.79,d:.86,nose:1.09,ny:.00,cheek:.33,pad:.26,ey:.20,lid:.78},
            persian:{w:.97,h:.87,d:.75,nose:.75,ny:.12,cheek:.42,pad:.23,ey:.24,lid:.96},
            maineCoon:{w:.77,h:.85,d:.88,nose:1.30,ny:-.05,cheek:.30,pad:.32,ey:.22,lid:.74},
            siamese:{w:.69,h:.77,d:.84,nose:1.22,ny:-.01,cheek:.22,pad:.22,ey:.20,lid:.74},
            britishShorthair:{w:.97,h:.85,d:.85,nose:.96,ny:.03,cheek:.43,pad:.30,ey:.20,lid:.96}
        },p=profiles[breed]||profiles.domesticShorthair,head=[];
        const e=(x,y,z,rx,ry,rz,tag='skull',blend=.10)=>{const sh=E(H(x,y,z),[rx,ry,rz].map(v=>v*sr),'Head',blend*sr,tag,hd,hu);head.push(sh);return sh;};
        const muzzle=p.nose+(r.snoutLength-(CAT_BREEDS[breed]?.over.snoutLength??KINDS.find(k=>k.kind==='cat').over.snoutLength))*.60,sw=r.snoutWidth;
        e(0,.06,-.18,p.w,p.h,p.d);
        e(0,.43,.18,p.w*.71,.35,p.d*.60);
        for(const s of [-1,1]){
            e(s*p.w*.61,-.17,.14,p.cheek,.34,.49,'cheek',.15);
            // Separate lip pads and a level, broad chin give Maine Coons their square muzzle.
            // The whisker pads: two full, rounded mounds either side of the philtrum.
            e(s*.20*sw,-.175,muzzle-.20,p.pad*sw,breed==='maineCoon'?.22:.205,.22,'whisker',.08);
            if(breed==='maineCoon')e(s*.25*sw,-.33,muzzle-.24,.24*sw,.13,.23,'jaw',.045);
        }
        e(0,-.38,muzzle-.35,(breed==='maineCoon'?.38:.29)*sw,.18,.27,'jaw',.08);
        e(0,-.31,.12,p.w*.65,.27,.52,'jaw',.15);
        e(0,.10,muzzle-.31,.22*sw,.21,.28,'snout',.10);
        // A longer-faced breed's muzzle runs out of the face in one taper (the bridge, the cheeks under the eyes), not a knob on its end.
        if(muzzle>1.04){const k=Math.min(1,(muzzle-1.04)/.25);
            {const sh=C(H(0,.16,.42),H(0,.03,muzzle-.12),(.30+.04*k)*sw*sr,.17*sw*sr,'Head',.12*sr,'snout');head.push(sh);}
            for(const s of [-1,1]){const sh=C(H(s*.34,-.12,.30),H(s*.16*sw,-.17,muzzle-.24),.20*sr,.15*sr,'Head',.12*sr,'cheek');head.push(sh);}}
        // The nose leather: small, a rounded triangle pointing down to the philtrum.
        e(0,p.ny,muzzle,.10*sw,.062,.08,'nosepad',.022);
        C(H(0,p.ny,muzzle-.01),H(0,p.ny-.085,muzzle-.02),.062*sw*sr,.018*sr,'Head',.016*sr,'nosepad');
        lay.whiskerPad={y:-.17,z:muzzle-.20};
        J.mouth={z0:.35,zt:muzzle};
        J.snoutTip=H(0,p.ny,muzzle);J.headTop=H(0,p.h+.06,-.18);
        for(const s of [-1,1]){
            const facing=norm(add([s*(.28+.55*r.eyeSide),0,0],add(mul(hd,.96-.55*r.eyeSide),mul(hu,.035))));
            const from=H(s*.25,p.ey,.26),at=surfaceAlong(head,from,facing,sr),R=.170*sr*r.eyeSize;
            // The opening an almond, its outer corner a little higher than the inner.
            const center=sub(at,mul(facing,R*.98)),lids=cut(ellipsoid(add(center,mul(facing,R*.56)),[R*1.0,R*p.lid,R*.78],'Head',R*.18,'skull',facing,add(hu,[s*.16,0,0])));
            S.push(lids);lay.eyes.push({center,facing,R,side:s,lids,tear:[]});
            const nostril=H(s*.077*sw,p.ny-.013,muzzle+.051);
            const hole=cut(ellipsoid(nostril,[.024,.013,.027].map(v=>v*sr),'Head',.006*sr,'nosepad',hd,hu));S.push(hole);lay.nostrils.push({shape:hole,R:.024*sr});
            lay.ears.push({base:H(s*(breed==='persian'||breed==='britishShorthair'?.67:.52),breed==='maineCoon'?.72:.64,-.29),side:s});
        }
        const line=[H(0,p.ny-.075,muzzle+.04),H(0,-.22,muzzle+.015)];
        S.push(cut(cone(...line,.018*sr,.014*sr,'Head',.010*sr,'snout')));lay.philtrum=line;
        lay.headShapes=head;
    }

    /**
     * A bird's head: a round braincase, the forehead sloping down to the beak, full cheeks and throat
     * feathered over, big eyes set on the sides each in a bare ring, a raptor's brow shelf over them. The
     * beak itself is a lofted piece (`lay.beak`), its root the cere with the nostrils in it: `r.beak`
     * 'hooked' (a raptor's) or 'straight' (a crow's or a songbird's).
     */
    function birdHead(r, lay, S, e, c, head) {
        const { H, sr, mL, hd, hu, J } = lay;
        const B = 'Head', hooked = r.beak !== 'straight' ? 1 : 0, sw = r.snoutWidth;
        const z0 = 0.62, zb = 0.84, zt = zb + 0.85 * mL;
        e(H(0, 0.1, -0.12), [0.86, 0.8, 0.92], 0.22, 'skull');
        e(H(0, 0.12, 0.42), [0.6, 0.55, 0.55], 0.22, 'skull');
        for (const s of [1, -1]) {
            e(H(s * 0.36, -0.12, 0.42), [0.36, 0.42, 0.45], 0.2, 'cheek');
            // A raptor's brow: a bony shelf over the eye that gives it its fierce look.
            if (hooked) c(H(s * 0.38, 0.44, 0.68), H(s * 0.52, 0.42, 0.0), 0.15, 0.1, 0.08, 'brow');
        }
        e(H(0, -0.42, 0.15), [0.5, 0.36, 0.6], 0.2, 'jaw');
        // The beak's root on the face.
        e(H(0, -0.02, zb - 0.12), [0.34 * sw, 0.36, 0.24], 0.14, 'snout');
        lay.beak = { hooked, zb, zt, sw };
        // The eyes: big, on the sides, looking out and a little forward.
        const eyeR = 0.2 * sr * r.eyeSize;
        for (const s of [1, -1]) {
            // A bird of prey's eyes look well forward (it sees ahead with both); a crow's more to the sides.
            const ahead = 0.45 * (1 - r.eyeSide * 0.6) + 0.45 * hooked;
            const facing = norm(add([s * 0.85, 0, 0], add(mul(hu, 0.08), mul(hd, ahead))));
            const from = H(s * 0.2, 0.18, 0.3 + 0.1 * hooked);
            const built = S.filter(q => !q.cut);
            let at = from;
            for (let i = 0; i < 80; i++) { const p = add(from, mul(facing, i * sr * 0.025)); if (fieldAt(head, p) > 0 && fieldAt(built, p) > 0) { at = p; break; } }
            const center = sub(at, mul(facing, eyeR * 0.9));
            const lids = cut(ellipsoid(add(center, mul(facing, eyeR * 0.6)), [eyeR * 0.92, eyeR * (0.84 - 0.12 * hooked), eyeR * 0.75], B, eyeR * 0.25, 'skull', facing, hu));
            S.push(lids);
            lay.eyes.push({ center, facing, R: eyeR, side: s, lids, tear: [] });
        }
        J.mouth = { z0, zt };
        lay.headShapes = head;
    }

    /** A paw (pads and toes, claws on a clawed foot) or a hoof (cloven or whole), under its carpus or hock. */
    function footShapes(r, lay, S, E, C, m, bone, ankle, toe, ps, lw, front, prof) {
        const g = lay.g, plant = r.plantigrade;
        if (r.feet === 'hoof') {
            const hr = 0.05 * ps * Math.sqrt(lw);
            const fet = [ankle[0], Math.max(hr * 2.2, ankle[1] * 0.3), ankle[2] + 0.01];
            const cor = [ankle[0], hr * 0.95, fet[2] + hr * 0.85];
            // Where the hoof wall meets the hair (the coronet), front and hind: the coat paints it there, crisp at any mesh size.
            lay[front ? 'hoofTopF' : 'hoofTopR'] = hr * (prof.cloven ? 0.95 : 1.0);
            C(m(ankle), m(fet), 0.03 * lw, 0.027 * lw, bone, 0.02 * g, 'lowerleg');
            E(m(fet), [0.033 * lw, 0.034 * lw, 0.036 * lw], bone, 0.02 * g, 'pastern');
            C(m(fet), m(cor), 0.027 * lw, hr * 0.85, bone, 0.02 * g, 'pastern');
            if (!prof.cloven) C(m(cor), m([cor[0], 0.012, cor[2] + 0.35 * hr]), hr * 0.8, hr * 1.0, bone, 0.006, 'hoof');
            else {
                for (const s of [1, -1]) C(m([cor[0] + s * 0.36 * hr, cor[1], cor[2]]), m([cor[0] + s * 0.42 * hr, 0.012, cor[2] + 0.5 * hr]), hr * 0.46, hr * 0.52, bone, 0.006, 'hoof');
                // Dewclaws high at the back of the fetlock.
                for (const s of [1, -1]) E(m([fet[0] + s * 0.02 * lw, fet[1] * 0.75, fet[2] - 0.032 * lw]), [0.01 * lw, 0.012 * lw, 0.014 * lw], bone, 0.006, 'hoof');
            }
            return;
        }
        const pr = 0.072 * ps * (0.6 + 0.4 * g) * (front ? 1 : 0.92);
        const P = toe;
        const back = (0.8 + 1.2 * plant) * pr;
        const heel = [P[0], 0.55 * pr, P[2] - 0.5 * pr - 1.1 * plant * pr];
        C(m(ankle), m(heel), 0.034 * lw, 0.45 * pr, bone, 0.03 * g, 'pastern');
        E(m([P[0], 0.5 * pr, P[2] - 0.12 * pr - 0.6 * plant * pr]), [0.8 * pr, 0.5 * pr, back], bone, 0.12 * pr, 'paw');
        E(m([P[0], 0.3 * pr, P[2] - 0.38 * pr - 0.8 * plant * pr]), [0.55 * pr, 0.3 * pr, (0.45 + 0.6 * plant) * pr], bone, 0.1 * pr, 'pad');
        // Four toes in an arc, the middle two ahead; tight enough to show each one.
        // Claws show by kind: a dog's, wolf's, fox's or rabbit's blunt claws always; a cat's retracted, only their tips.
        const claw = r.feet === 'claw';
        const showClaw = claw ? 1 : prof.felid ? 0.2 : r.kind === 'rabbit' ? 0.75 : 0.62;
        for (const deg of [-50, -17, 17, 50]) {
            const a = deg * DEG;
            const reach = (deg === 17 || deg === -17) ? 1 : 0.86;
            const tc = [P[0] + Math.sin(a) * 0.6 * pr, 0.3 * pr, P[2] + (Math.cos(a) * 0.5 + 0.25) * pr * reach + (claw ? 0.1 * pr : 0)];
            const dir = norm([Math.sin(a) * 0.35, -0.12, 1]);
            E(m(tc), [0.26 * pr, 0.29 * pr, (claw ? 0.4 : 0.33) * pr], bone, 0.07 * pr, 'toe', m(dir));
            lay.toes.push({ tip: m(add(tc, mul(dir, (claw ? 0.36 : 0.26) * pr))), dir: m(dir), r: 0.12 * pr, bone, front, claw: true, clawK: showClaw });
        }
        // A dewclaw high on the inside of the foreleg (dogs, wolves, foxes, cats): a small thumb with its own claw.
        if (front && !claw && plant < 0.5 && r.kind !== 'rabbit') {
            const side = Math.sign(P[0]) || 1, dc = [P[0] - side * 0.42 * pr, Math.max(0.9 * pr, ankle[1] * 0.45), P[2] - 0.3 * pr];
            const dir = norm([-side * 0.35, -0.5, 0.75]);
            E(m(dc), [0.17 * pr, 0.2 * pr, 0.22 * pr], bone, 0.08 * pr, 'toe', m(dir));
            lay.toes.push({ tip: m(add(dc, mul(dir, 0.2 * pr))), dir: m(dir), r: 0.09 * pr, bone, front, claw: true, clawK: showClaw * 0.9 });
        }
    }

    /** Manes: shapes over the head and neck, roughened into locks. */
    function maneShapes(r, lay, S, E, C) {
        if (r.mane === 'none' || r.maneSize <= 0 || profileOf(r).face === 'bird') return;
        const { J, H, sr, hd, hu, zS, yS, g, gv } = lay;
        // A mane past the everyday size grows longer hair (the strand cards) more than it grows in bulk.
        const ms = r.maneSize <= 1.2 ? r.maneSize : 1.2 + (r.maneSize - 1.2) * 0.35;
        const nk = r.neckThickness <= 1.4 ? r.neckThickness : 1.4 + (r.neckThickness - 1.4) * 0.5, nt = nk * Math.sqrt(g * gv);
        const lumpy = s => Object.assign(s, { bump: 0.012 * ms * g + 0.004, bumpScale: 13, bumpSeed: 11 });
        if(r.kind==='cat'&&r.mane==='ruff'){
            const fullness=sr*(r.catType==='persian'?.88:r.catType==='maineCoon'?.82:.72),axis=norm(sub(J.atlas,J.neck));
            E(lerp(J.neck,J.atlas,.62),[fullness,fullness*.93,fullness*1.08],'Neck',.10*sr,'mane',axis);
            E(add(lerp(J.neck,J.atlas,.28),[0,-.04*g,.055*g]),[fullness*.88,fullness*1.12,fullness*.70],'Chest',.09*sr,'mane');
            for(const s of [-1,1])E(H(s*.62,-.28,-.34),[.29,.35,.37].map(v=>v*sr),'Head',.10*sr,'cheek',hd,hu);
            return;
        }
        if (r.mane === 'lion') {
            // A ruff framing the face behind the cheeks and ears, the mass of it down the neck, a bib over the chest.
            const R = (1.0 + 0.15 * ms) * sr, size = 0.55 + 0.4 * ms;
            for (let i = 0; i < 11; i++) {
                const phi = (-130 + 260 * i / 10) * DEG;
                const at = H(Math.sin(phi) * R / sr, -0.1 + Math.cos(phi) * R / sr, -0.7 - 0.32 * Math.max(0, Math.cos(phi)));
                const out = norm(add(mul([Math.sin(phi) * 0.5, 0, 0], 1), add(mul(hu, Math.cos(phi) * 0.5), mul(hd, -1))));
                lumpy(E(at, [0.34 * sr * size, 0.34 * sr * size, 0.58 * sr * size], 'Head', 0.22 * sr, 'mane', out));
            }
            // Down the neck it is full for a lion's length of neck behind the head, then thins to a crest to the withers.
            const nape = H(0, -0.1, -1.3), wit = [0, J.withers[1] - 0.06 * g, zS - 0.1], full = lerp(nape, wit, Math.min(1, 0.42 / Math.max(1e-3, len(sub(wit, nape)))));
            lumpy(C(nape, full, (0.12 + 0.09 * ms) * nt, (0.12 + 0.08 * ms) * nt, 'Neck', 0.07 * g, 'mane'));
            if (len(sub(wit, full)) > 0.05) lumpy(C(full, wit, (0.12 + 0.08 * ms) * nt * 0.6, (0.12 + 0.08 * ms) * nt, 'Neck', 0.07 * g, 'mane'));
            lumpy(C(H(0, -0.85, -0.7), [0, yS - 0.02 * g, zS + 0.1], (0.1 + 0.07 * ms) * nt, (0.1 + 0.07 * ms) * g, 'Neck', 0.07 * g, 'mane'));
            lumpy(E([0, yS - 0.08 * g, zS + 0.09], [0.13 * g * (0.6 + 0.4 * ms), 0.2 * g * (0.6 + 0.4 * ms), 0.11 * (0.6 + 0.4 * ms)], 'Chest', 0.07 * g, 'mane'));
            lumpy(E([0, J.withers[1] - 0.02 * g, zS - 0.08], [0.17 * g * ms, 0.07 * g * ms + 0.02, 0.18 * ms], 'Chest', 0.07 * g, 'mane'));
        } else if (r.mane === 'horse') {
            const up = norm(cross(sub(J.atlas, J.neck), [1, 0, 0]));
            for (let i = 0; i < 6; i++) {
                const t0 = i / 6, t1 = (i + 1) / 6;
                const a = add(lerp(add(J.neck, [0, 0.12 * nt, -0.12]), J.atlas, t0), mul(up, -0.1 * nt)), b = add(lerp(add(J.neck, [0, 0.12 * nt, -0.12]), J.atlas, t1), mul(up, -0.085 * nt));
                lumpy(E(lerp(a, b, 0.5), [0.03 * ms + 0.008, 0.055 * ms + 0.02, len(sub(b, a)) * 0.7], 'Neck', 0.02, 'mane', sub(b, a)));
            }
        } else {
            lumpy(E(lerp(J.neck, J.atlas, 0.45), [0.17 * nt * (0.8 + 0.4 * ms), 0.17 * nt * (0.8 + 0.4 * ms), 0.15 * nt * (0.8 + 0.3 * ms)], 'Neck', 0.12 * g, 'mane', sub(J.atlas, J.neck)));
        }
    }

    /** Find the skin in a direction from an interior landmark, including extreme body proportions. */
    function surfaceAlong(shapes, from, direction, g) {
        const dir = norm(direction), step = 0.012 * Math.max(0.3, g);
        let inside = from.slice();
        if (fieldAt(shapes, inside) >= 0) {
            for (let i = 1; i <= 160; i++) {
                const q = add(from, mul(dir, -i * step));
                if (fieldAt(shapes, q) < 0) { inside = q; break; }
            }
        }
        if (fieldAt(shapes, inside) >= 0) return from.slice();
        for (let i = 1; i <= 320; i++) {
            let outside = add(inside, mul(dir, step));
            if (fieldAt(shapes, outside) >= 0) {
                for (let j = 0; j < 12; j++) {
                    const mid = lerp(inside, outside, 0.5);
                    if (fieldAt(shapes, mid) < 0) inside = mid; else outside = mid;
                }
                return lerp(inside, outside, 0.5);
            }
            inside = outside;
        }
        return inside;
    }

    /** The underside of the shapes built so far straight below `from`: down into them, then out at the bottom. */
    function surfaceBelow(S, from, g) {
        const list = S.filter(s => !s.cut);
        let entered = false;
        for (let y = from[1] + 0.6 * g; y > 0; y -= 0.004 * g) {
            const q = [from[0], y, from[2]], inside = fieldAt(list, q) < 0;
            if (inside) entered = true;
            else if (entered) return surfaceAlong(list, add(q, [0, 0.008 * g, 0]), [0, -1, 0], g);
        }
        return from;
    }

    /** The tail starts inside the actual rump; the first skin ring follows the hips through motion. */
    function attachTail(r, lay, shapes) {
        const { J, g } = lay;
        if (r.tail === 'none' || r.tailLength <= 0) return;
        const direction = norm(sub(J.tailRoot, J.hips));
        const surface = surfaceAlong(shapes, J.hips, direction, g);
        const depth = (r.tail === 'thick' ? 0.09 : 0.065) * r.tailThickness * g;
        const root = add(surface, mul(direction, -depth));
        const move = sub(root, J.tailRoot);
        J.tail = J.tail.map((p, i) => add(p, mul(move, 1 - smooth(0, 0.5, i / (J.tail.length - 1)))));
        J.tailRoot = J.tail[0];
        lay.tailAttachment = { root: root.slice(), surface, direction };
    }

    /**
     * External genitalia and udders as a veterinary model shows them: a male's
     * sheath (prepuce) on the belly or under the tail and the scrotum, a
     * female's vulva below the tail and an udder between the thighs where the
     * species has one. Teats along the belly are small pieces of their own.
     */
    function anatomyShapes(r, lay, S, E, C, prof) {
        const { zH, yH, g, bl, J } = lay, a = r.anatomy;
        if (prof.genital === 'cloaca') return;
        // Every anchor is measured on the unmodified body, so a preceding detail cannot become
        // the next detail's attachment surface. Offsets scale in body units before final sizing.
        const skin = S.slice();
        const rear = surfaceAlong(skin, J.hips, [0, -0.25, -1], g);
        lay.anus = add(rear, [0, 0.045 * g, 0]);
        lay.anatomyRoots = [];
        const attach = (surface, direction, radius, bone, tag) => {
            // Tiny controls still need a root deeper than the coarse body's surface error.
            const inside = add(surface, mul(direction, -Math.max(radius * 1.5, 0.018 * g)));
            const outside = add(surface, mul(direction, radius * 0.5));
            C(inside, outside, radius, radius * 0.9, bone, radius * 0.45, tag);
            lay.anatomyRoots.push({ p: inside, bone, tag });
            return outside;
        };
        const belly = () => {
            const equine = r.kind === 'horse', thickness = (equine ? 0.043 : 0.026) * g * a.sheath;
            const points = [];
            for (let i = 0; i < 5; i++) {
                const z = zH + (0.18 + i * 0.065) * bl;
                const q = surfaceBelow(skin, [0, yH, z], g);
                points.push(add(q, [0, -thickness * 0.18, 0]));
            }
            attach(points[0], [0, -1, 0], thickness, 'Spine', 'sheath');
            for (let i = 1; i < points.length; i++) C(points[i - 1], points[i], thickness, thickness * (1 - 0.12 * i / 4), 'Spine', thickness * 0.5, 'sheath');
            lay.sheathTip = add(points[4], [0, -thickness * 0.4, thickness * 0.45]);
            return { p: lay.sheathTip, direction: norm([0, -0.9, 0.25]), radius: thickness * 0.55, bone: 'Spine' };
        };
        if (a.sex === 'male') {
            let opening;
            if (prof.genital === 'perineal') {
                const down = norm([0, -0.7, -0.6]), large = prof.bigcat ? 1.35 : 1;
                if (a.testicles > 0) {
                    const radius = 0.037 * g * large * a.testicles;
                    const root = attach(rear, down, radius * 0.75, 'Hips', 'scrotum');
                    const center = add(root, mul(down, radius * 0.65));
                    for (const side of [1, -1]) E(add(center, [side * radius * 0.6, 0, 0]), [radius * 0.7, radius, radius * 0.85], 'Hips', radius * 0.25, 'scrotum');
                }
                if (prof.sheath === 'belly') opening = belly();
                else {
                    const surface = surfaceAlong(skin, J.hips, [0, -0.45, -1], g);
                    const radius = 0.025 * g * a.sheath;
                    const root = attach(surface, down, radius, 'Hips', 'sheath');
                    E(root, [radius * 0.8, radius, radius], 'Hips', radius * 0.4, 'sheath', down);
                    lay.sheathTip = add(root, mul(down, radius * 0.8));
                    opening = { p: lay.sheathTip, direction: down, radius: radius * 0.45, bone: 'Hips' };
                }
            } else {
                opening = belly();
                if (a.testicles > 0) {
                    const pendulous = prof.genital === 'pendulous', equine = r.kind === 'horse';
                    const surface = surfaceBelow(skin, [0, yH, zH + 0.02 * bl], g);
                    const radius = (equine ? 0.048 : pendulous ? 0.05 : 0.032) * g * a.testicles;
                    const root = attach(surface, [0, -1, 0], radius * 0.7, 'Hips', 'scrotum');
                    const center = add(root, [0, -radius * (pendulous ? 1.0 : 0.35), -radius * 0.1]);
                    C(root, center, radius * 0.7, radius * 0.75, 'Hips', radius * 0.3, 'scrotum');
                    for (const side of [1, -1]) E(add(center, [side * radius * 0.55, 0, 0]), [radius * 0.7, radius * (pendulous ? 1.25 : 0.75), radius * (equine ? 1.25 : 0.9)], 'Hips', radius * 0.25, 'scrotum');
                }
            }
            // A visible, relaxed free portion is optional; the species' resting sheath remains the default.
            if (a.length > 0.001) {
                const length = (r.kind === 'horse' ? 0.28 : prof.bigcat ? 0.1 : 0.13) * g * a.length;
                const radius = opening.radius * a.girth;
                const start = add(opening.p, mul(opening.direction, -radius * 1.2));
                const end = add(opening.p, mul(opening.direction, length));
                C(start, end, radius, radius * (r.kind === 'horse' ? 0.95 : 0.55), opening.bone, radius * 0.25, 'genital');
                E(end, [radius, radius * 0.7, radius], opening.bone, radius * 0.2, 'genital', opening.direction);
            }
        } else {
            const direction = norm([0, -0.25, -1]), radius = 0.02 * g * a.vulva;
            const root = attach(rear, direction, radius * 0.8, 'Hips', 'vulva');
            for (const side of [1, -1]) E(add(root, [side * radius * 0.45, 0, 0]), [radius * 0.5, radius * 1.5, radius * 0.7], 'Hips', radius * 0.2, 'vulva', direction);
            S.push(cut(ellipsoid(add(root, mul(direction, radius * 0.65)), [radius * 0.16, radius * 1.15, radius * 0.5], 'Hips', radius * 0.1, 'vulva', direction)));
            lay.vulva = root;
            const t = prof.teats;
            if (t && t.udder && a.udder > 0) {
                const surface = surfaceBelow(skin, [0, yH, zH + 0.08], g), u = t.udder * a.udder;
                const ry = 0.065 * g * u;
                lay.udder = add(surface, [0, -ry * 0.35, 0]);
                attach(surface, [0, -1, 0], ry * 0.7, 'Hips', 'udder');
                E(lay.udder, [0.09 * g * Math.sqrt(u), ry, 0.09 * g * Math.sqrt(u)], 'Hips', 0.025 * g, 'udder');
            }
        }
    }

    // ── lofted pieces ──────────────────────────────────────────────────────
    /**
     * A tube along `path`, each ring an ellipse (`radius(t)` → [across, through]),
     * flattened across `flat` (a direction, or null for round) and cupped by
     * `cup` (its middle pushed back by that share of its width), with a cone
     * cap at the end. Returns { positions, index, t (per vertex 0..1 along the path) }.
     */
    function loft(path, radius, sides, flat, startCap, cup) {
        const n = path.length;
        const positions = [], index = [], tv = [];
        // Frames: tangent, and a normal carried along so rings do not twist.
        let prevN = null;
        const rings = [];
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const tan = norm(i === 0 ? sub(path[1], path[0]) : i === n - 1 ? sub(path[n - 1], path[n - 2]) : sub(path[i + 1], path[i - 1]));
            let N;
            if (flat) N = norm(sub(flat, mul(tan, dot(flat, tan))));
            else if (prevN) N = norm(sub(prevN, mul(tan, dot(prevN, tan))));
            else { N = cross(tan, [0, 1, 0]); if (len(N) < 1e-4) N = cross(tan, [1, 0, 0]); N = norm(N); }
            if (!len(N) || !Number.isFinite(N[0])) N = [1, 0, 0];
            prevN = N;
            const Bv = norm(cross(tan, N));
            const [ra, rb] = radius(t);
            const ring = [];
            for (let k = 0; k < sides; k++) {
                const a = (k / sides) * Math.PI * 2;
                // Across N is the wide way (ra), along B the thin way (rb).
                ring.push(positions.length / 3);
                const ca = Math.cos(a);
                const bend = cup ? cup * ra * (1 - ca * ca) * (1 - t * 0.6) : 0;
                const p = add(path[i], add(mul(N, ca * ra), mul(Bv, Math.sin(a) * rb + bend)));
                positions.push(p[0], p[1], p[2]);
                tv.push(t);
            }
            rings.push(ring);
        }
        for (let i = 0; i + 1 < n; i++) for (let k = 0; k < sides; k++) {
            const a = rings[i][k], b = rings[i][(k + 1) % sides], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % sides];
            index.push(a, b, c, b, d, c);
        }
        // The far end closes on a point a little past the last ring.
        const endTan = norm(sub(path[n - 1], path[n - 2]));
        const [era] = radius(1);
        const tip = add(path[n - 1], mul(endTan, Math.max(era, 1e-4) * 0.6));
        const tipIndex = positions.length / 3;
        positions.push(tip[0], tip[1], tip[2]); tv.push(1);
        for (let k = 0; k < sides; k++) index.push(rings[n - 1][k], rings[n - 1][(k + 1) % sides], tipIndex);
        if (startCap) {
            const st = norm(sub(path[0], path[1]));
            const [sra] = radius(0);
            const sp = add(path[0], mul(st, sra * 0.4));
            const si = positions.length / 3;
            positions.push(sp[0], sp[1], sp[2]); tv.push(0);
            for (let k = 0; k < sides; k++) index.push(rings[0][k], si, rings[0][(k + 1) % sides]);
        }
        return { positions, index, t: tv };
    }

    /**
     * An ear: a thin cupped shell along `path`, `width(t)` across and `thick(t)` through, its front hollowed
     * by `cup` (a share of its width), its rim rolled round, its tip closed soft. Like `loft`, but each
     * vertex also carries `face` (-1 on the inside of the cup, 1 on the back) and `u` (-1..1 across).
     */
    function earShell(path, width, thick, flat, cup, sides) {
        const n = path.length, positions = [], index = [], tv = [], face = [], uv = [];
        const rings = [];
        for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const tan = norm(i === 0 ? sub(path[1], path[0]) : i === n - 1 ? sub(path[n - 1], path[n - 2]) : sub(path[i + 1], path[i - 1]));
            const N = norm(sub(flat, mul(tan, dot(flat, tan)))), Bv = norm(cross(tan, N));
            const w = Math.max(width(t), 1e-4), th = thick(t);
            const ring = [];
            for (let k = 0; k < sides; k++) {
                // Angles bunched toward the rim, so the roll of the edge is round.
                const a = (k / sides) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
                const across = Math.sign(ca) * Math.pow(Math.abs(ca), 0.7);
                const hollow = cup * w * (1 - across * across) * (1 - 0.5 * t);
                const through = sa * th * (0.55 + 0.9 * across * across);
                ring.push(positions.length / 3);
                const p = add(path[i], add(mul(N, across * w), mul(Bv, hollow + through)));
                positions.push(p[0], p[1], p[2]); tv.push(t); face.push(sa); uv.push(across);
            }
            rings.push(ring);
        }
        for (let i = 0; i + 1 < n; i++) for (let k = 0; k < sides; k++) {
            const a = rings[i][k], b = rings[i][(k + 1) % sides], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % sides];
            index.push(a, b, c, b, d, c);
        }
        // The tip closes on a point just past the last ring.
        const endTan = norm(sub(path[n - 1], path[n - 2]));
        const tip = add(path[n - 1], mul(endTan, Math.max(width(1), thick(1)) * 0.5));
        const ti = positions.length / 3;
        positions.push(tip[0], tip[1], tip[2]); tv.push(1); face.push(0); uv.push(0);
        for (let k = 0; k < sides; k++) index.push(rings[n - 1][k], rings[n - 1][(k + 1) % sides], ti);
        return { positions, index, t: tv, face, u: uv };
    }

    /** A smooth path through control points (Catmull-Rom), `count` points. */
    function curve(points, count) {
        const out = [];
        const n = points.length;
        for (let i = 0; i < count; i++) {
            const u = (i / (count - 1)) * (n - 1);
            const k = Math.min(n - 2, Math.floor(u)), t = u - k;
            const p0 = points[Math.max(0, k - 1)], p1 = points[k], p2 = points[k + 1], p3 = points[Math.min(n - 1, k + 2)];
            const t2 = t * t, t3 = t2 * t;
            out.push([0, 1, 2].map(j => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
        }
        return out;
    }

    /** A spiral (a ram's horn) about an axis through `center`. */
    function spiral(center, axis, start, turns, shrink, count) {
        const ax = norm(axis);
        let r0 = sub(start, center);
        r0 = sub(r0, mul(ax, dot(r0, ax)));
        const R = len(r0), u = norm(r0), v = norm(cross(ax, u));
        const out = [];
        for (let i = 0; i < count; i++) {
            const t = i / (count - 1), a = t * turns * Math.PI * 2, rad = R * (1 - shrink * t);
            out.push(add(center, add(add(mul(u, Math.cos(a) * rad), mul(v, Math.sin(a) * rad)), mul(ax, t * R * 0.9))));
        }
        return out;
    }

    /**
     * The lofted pieces: ears, tail, horns, tusks, claws, spines. Each { mesh, kind
     * ('coat'|'horn'|'hair'), weights: (t) → [[bone, w], …], tag }.
     */
    function loftsOf(r, lay) {
        const { J, g, ht } = lay;
        const out = [];
        const sr = J.skullR, hd = J.hdir;
        const rigid = bone => () => [[bone, 1]];
        // Ears: their open side forward, cupped.
        if (r.ears !== 'none' && r.earSize > 0) {
            const es = r.earSize * ht;
            const standard = {
                pointed: { len: 0.13, wide: 0.07, tip: 0.0, out: 0.5, up: 0.9, back: -0.05, cup: 0.35 },
                round: { len: 0.085, wide: 0.058, tip: 0.55, out: 0.55, up: 0.88, back: 0.1, cup: 0.45 },
                floppy: { len: 0.16, wide: 0.07, tip: 0.6, out: 1, up: 0.0, back: 0.1, droop: 1.3, cup: 0.1 },
                long: { len: 0.3, wide: 0.06, tip: 0.45, out: 0.3, up: 1, back: 0.25, cup: 0.4, leaf: true },
                narrow: { len: 0.13, wide: 0.045, tip: 0.1, out: 0.85, up: 0.6, back: 0.2, cup: 0.4 },
                small: { len: 0.06, wide: 0.04, tip: 0.2, out: 0.8, up: 0.5, back: 0.4, cup: 0.2 }
            }[r.ears];
            const rounded=['persian','britishShorthair','ragamuffin'].includes(r.catType);
            // A pig's floppy ears lean forward and hang over its eyes like visors.
            const pigEar=profileOf(r).face==='pig'&&r.ears==='floppy';
            const spec=pigEar?{ len: 0.15, wide: 0.085, tip: 0.5, out: 0.5, up: 0.6, back: -0.6, droop: 0.5, cup: 0.3 }:r.kind==='cat'&&r.ears==='pointed'?{...standard,...(rounded?{len:r.catType==='ragamuffin'?.105:.10,tip:.20,out:.38}:r.catType==='maineCoon'?{len:.145,out:.22,up:1}: {})}:standard;
            for (const ear of lay.ears) {
                const side = ear.side;
                const droop = (spec.droop || 0) + r.earDroop;
                const dir = norm([side * spec.out, spec.up - droop * 0.9, -spec.back - Math.max(0, droop) * 0.15]);
                const L = spec.len * es;
                // The root starts inside the head, so the ear grows out of the skin rather than sitting on it.
                const base = add(add(ear.base, mul(J.hup, -0.08 * sr)), mul(dir, -0.12 * L));
                const pts = curve([base, add(base, mul(dir, L * 0.55)), add(add(base, mul(dir, L * 1.12)), [0, -Math.max(0, droop) * L * 0.25, 0])], 18);
                // Wide across the head, thin front to back: the ear opens forward.
                const flatDir = pigEar ? norm([1, 0, -side * 0.2]) : norm([1, 0, side * 0.35]);
                // The outline: from the root's width out to the widest, then rounding to the tip (a leaf narrows
                // at the root); the tip is round or pointed, never a corner.
                const tm = spec.leaf ? 0.45 : 0.32, b0 = spec.leaf ? 0.55 : 0.8, pr = 1.15 + 1.6 * spec.tip;
                const width = t => spec.wide * es * (t < tm ? b0 + (1 - b0) * Math.sin(t / tm * Math.PI / 2) : Math.pow(Math.max(0, 1 - Math.pow((t - tm) / (1 - tm), pr)), 1 / pr));
                const thick = t => spec.wide * es * (0.09 + 0.16 * Math.pow(1 - t, 3));
                const mesh = earShell(pts, width, thick, flatDir, spec.cup * (droop > 0.6 ? 0.25 : 1), 20);
                ear.tip = pts[pts.length - 1];
                out.push({ mesh, kind: 'coat', weights: rigid('Head'), tag: 'ear' });
            }
        }
        // A crest's forelock: a lock of hair from the poll between the ears, falling forward over the forehead.
        if (r.mane === 'horse' && r.maneSize > 0) {
            const ms = Math.min(1.6, r.maneSize), hu = J.hup, H = lay.H;
            const lift = q => { for (let i = 0; i < 40; i++) { const t = add(q, mul(hu, i * sr * 0.02)); if (fieldAt(lay.headShapes, t) > 0) return add(t, mul(hu, 0.03 * sr)); } return q; };
            const pts = curve([lift(H(0, 0.6, -0.25)), lift(H(0, 0.6, 0.05)), lift(H(0, 0.45, 0.32 + 0.12 * ms)), add(lift(H(0, 0.3, 0.45 + 0.2 * ms)), mul(hu, -0.02 * sr))], 10);
            const width = t => sr * (0.1 + 0.04 * ms) * (t < 0.3 ? 0.7 + t : 1 - 0.7 * (t - 0.3) / 0.7);
            const mesh = loft(pts, t => { const w = width(t); return [w, Math.max(0.012 * sr, w * 0.2)]; }, 10, [1, 0, 0], true);
            out.push({ mesh, kind: 'hair', weights: rigid('Head'), tag: 'forelock' });
            lay.forelock = { pts, width };
        }
        // Tail.
        const tail = J.tail;
        if (r.tail !== 'none' && tail.length > 1 && len(sub(tail[tail.length - 1], tail[0])) > 1e-3) {
            const tt = r.tailThickness * g;
            const pts = curve(tail, 18);
            const bushy = r.tail === 'bushy', horse = r.tail === 'horse', thick = r.tail === 'thick';
            const radius = t => {
                let rr;
                if (bushy) rr = 0.03 * tt + 0.05 * tt * Math.sin(Math.PI * Math.min(1, t * 1.05)) * (1 - 0.25 * t);
                else if (horse) rr = 0.035 * tt + 0.06 * tt * smooth(0.05, 0.4, t) * (1 - 0.5 * t);
                else if (thick) rr = 0.085 * tt * (1 - t * 0.92) + 0.005;
                else if (r.tail === 'stub') rr = 0.06 * tt * (1 - 0.6 * t);
                else if (r.kind === 'armadillo') { const ring = t * 14 - Math.floor(t * 14); rr = (0.078 * (1 - 0.9 * t ** 0.75) + 0.004) * tt * (1 + 0.09 * (1 - 0.6 * t) * smooth(0.45, 0.92, ring) * (1 - smooth(0.92, 1, ring))); }
                else rr = (0.04 + 0.022 * (1 - smooth(0, 0.2, t))) * tt * (1 - t * 0.5);
                return horse ? [rr * 1.3, rr * 0.6] : [rr, rr];
            };
            // A tail that reaches the ground lies on it, never through it.
            pts.forEach((p, i) => { p[1] = Math.max(p[1], radius(i / (pts.length - 1))[1] + 0.003 * g); });
            const mesh = loft(pts, radius, 12, horse ? [1, 0, 0] : null, true);
            const names = ['Tail', 'Tail2', 'Tail3'];
            const w = t => {
                const u = clamp(t * 3 - 0.5, 0, 2);
                const i = Math.floor(u), f = u - i;
                if (t < 0.15) return [['Hips', 1 - t / 0.15], ['Tail', t / 0.15]];
                if (i >= 2) return [[names[2], 1]];
                return [[names[i], 1 - f], [names[i + 1], f]];
            };
            out.push({ mesh, kind: r.tail === 'horse' || r.tail === 'bushy' ? 'hair' : 'coat', weights: w, tag: 'tail' });
            if (r.tail === 'tufted') {
                // The tuft's core: a small spindle of hair at the end the strands grow out of.
                const end = tail[tail.length - 1], before = tail[tail.length - 2];
                const tuft = curve([lerp(before, end, 0.55), end, add(end, mul(norm(sub(end, before)), 0.06 * tt))], 7);
                out.push({ mesh: loft(tuft, t => { const v = 0.04 * tt * Math.sin(Math.PI * clamp(t * 1.1 + 0.05, 0, 1)) + 0.004; return [v, v]; }, 10, null, true), kind: 'hair', weights: () => [['Tail3', 1]], tag: 'tuft' });
                lay.tuft = { from: lerp(before, end, 0.55), to: end, dir: norm(sub(end, before)), r: 0.04 * tt };
            }
        }
        // A bird's beak: the upper mandible from the cere out to its tip, hooked down over the lower on a raptor;
        // the lower shorter under it. A crest (the mane's choice) of feathers fanning back off the crown.
        if (lay.beak) {
            const { hooked, zb, zt, sw } = lay.beak, H = lay.H;
            const up = curve([H(0, -0.02, zb - 0.1), H(0, -0.02 - 0.0 * hooked, (zb + zt) / 2), H(0, -0.1 - 0.12 * hooked, zt - 0.1 * hooked), H(0, -0.16 - 0.34 * hooked, zt - 0.08 * hooked)], 16);
            const upR = t => [sr * (0.28 * sw * Math.pow(1 - t, 0.8) + 0.015), sr * ((0.3 + 0.08 * hooked) * Math.pow(1 - t, 0.9) + 0.02)];
            out.push({ mesh: loft(up, upR, 14, [1, 0, 0], true), kind: 'horn', weights: rigid('Head'), tag: 'beak' });
            // The nostrils: one each side in the cere at the beak's root, high on its side.
            const k0 = 3, at0 = up[k0], [w0, h0] = upR(k0 / (up.length - 1));
            lay.beak.holes = [1, -1].map(s2 => add(at0, add([s2 * w0 * 0.85, 0, 0], mul(J.hup, h0 * 0.35))));
            lay.beak.holeR = w0 * 0.32;
            const lo = curve([H(0, -0.28, zb - 0.1), H(0, -0.3, (zb + zt) / 2 - 0.1), H(0, -0.3 - 0.03 * hooked, zb + (zt - zb) * (0.85 - 0.15 * hooked))], 12);
            out.push({ mesh: loft(lo, t => [sr * (0.24 * sw * Math.pow(1 - t, 0.7) + 0.012), sr * (0.14 * (1 - 0.6 * t) + 0.01)], 10, [1, 0, 0], true), kind: 'horn', weights: rigid('Head'), tag: 'beak' });
            if (r.mane !== 'none' && r.maneSize > 0) {
                // Rows of feathers fanned out sideways as well as back, so the crest is full from the front.
                for (let k = 0; k < 7; k++) for (const col of [-1, 0, 1]) {
                    const f = k / 6, x = col * (0.2 - 0.06 * f), base = H(x, 0.7 - 0.12 * f - 0.05 * Math.abs(col), 0.25 - 0.6 * f);
                    const dir = norm(add(add(mul(J.hup, 1 - 0.55 * f), mul(hd, -0.35 - 0.7 * f)), [col * 0.45, 0, 0]));
                    const L = sr * r.maneSize * (0.55 + 0.35 * Math.sin(Math.PI * (0.25 + 0.6 * f))) * (col ? 0.82 : 1);
                    const pts = curve([base, add(base, mul(dir, L * 0.5)), add(add(base, mul(dir, L)), mul(hd, -0.15 * L))], 8);
                    // Each feather broad across the head, so it shows from the front and the side alike.
                    const flatF = norm(add(mul(hd, 0.55), [col === 0 ? (k % 2 ? 0.8 : -0.8) : col, 0, 0]));
                    out.push({ mesh: loft(pts, t => { const w = sr * 0.12 * Math.sqrt(Math.max(0, Math.sin(Math.PI * Math.min(1, t * 0.95 + 0.05)))) + 0.002; return [w, Math.max(0.008 * sr, w * 0.14)]; }, 8, flatF, false), kind: 'coat', weights: rigid('Head'), tag: 'crest' });
                }
            }
        }
        // Claws: curved and pointed, out of each toe of a clawed foot.
        for (const toe of lay.toes) {
            if (!toe.claw) continue;
            const L = toe.r * (toe.front ? 5 : 4) * (r.plantigrade > 0.5 ? 1.3 : 1) * (toe.clawK ?? 1);
            const d = toe.dir;
            const pts = curve([toe.tip, add(toe.tip, add(mul(d, L * 0.5), [0, -L * 0.05, 0])), add(toe.tip, add(mul(d, L * 0.85), [0, -L * 0.4, 0]))], 7);
            const cw = 0.6 + 0.4 * (toe.clawK ?? 1);
            out.push({ mesh: loft(pts, t => { const v = toe.r * cw * (1 - 0.85 * t); return [v * 0.8, v]; }, 6, [1, 0, 0], true), kind: 'horn', weights: rigid(toe.bone), tag: 'claw' });
        }
        // Horns.
        const hs = r.hornSize * ht;
        if (r.horns !== 'none' && hs > 0) {
            const hornTube = (pts, r0, r1, sides = 10) => loft(pts, t => { const v = r0 + (r1 - r0) * t; return [v, v]; }, sides, null, true);
            const top = J.skull;
            for (const side of [1, -1]) {
                const s = p => [p[0] * side, p[1], p[2]];
                const base = add(top, s([sr * 0.5, sr * 0.7, sr * 0.05]));
                if (r.horns === 'bull') {
                    const pts = curve([base, add(base, s([0.12 * hs, 0.01 * hs, 0])), add(base, s([0.2 * hs, 0.07 * hs, 0.05 * hs])), add(base, s([0.23 * hs, 0.15 * hs, 0.08 * hs]))], 12);
                    out.push({ mesh: hornTube(pts, 0.028 * hs, 0.004), kind: 'horn', weights: rigid('Head'), tag: 'horn' });
                } else if (r.horns === 'ram') {
                    // From the top of the skull above and behind the eye, the horn sweeps back, down past the ear
                    // and forward again beside the cheek, close against the head, thick at the root and ridged.
                    const H = lay.H, k = clamp(hs / ht, 0.4, 2.2), hu = J.hup;
                    const root = H(side * 0.4, 0.42, -0.05), turns = 0.95 + 0.25 * Math.min(1, k);
                    const R0 = 0.7 * sr * Math.sqrt(k), cen = add(sub(root, add(mul(hu, R0 * 0.966), mul(hd, R0 * 0.259))), add(mul(hd, 0.18 * sr), mul(hu, -0.12 * sr)));
                    const pts = [];
                    for (let i = 0; i <= 84; i++) {
                        const t = i / 84, a = (-15 + 360 * turns * t) * DEG, rad = R0 * (1 - 0.5 * t);
                        const q = add(cen, add(mul(hu, Math.cos(a) * rad), mul(hd, -Math.sin(a) * rad)));
                        pts.push(add(q, [side * (0.2 + 0.55 * t) * sr * Math.sqrt(k), 0, 0]));
                    }
                    // The root runs out of the skull into the coil.
                    pts.unshift(add(root, [-side * 0.05 * sr, -0.1 * sr, 0]));
                    const r0 = 0.22 * sr * Math.sqrt(k);
                    // Annual growth ridges: close-set raised rings all the way round the horn, finer toward the tip.
                    const mesh = loft(pts, t => { const ring = Math.pow(Math.abs(Math.sin(t * Math.PI * 30)), 0.6); const v = (r0 * (1 - 0.82 * t) + 0.004) * (1 + 0.06 * ring * (1 - 0.6 * t)); return [v, v * 0.78]; }, 14, null, false);
                    out.push({ mesh, kind: 'horn', weights: rigid('Head'), tag: 'horn' });
                } else if (r.horns === 'goat') {
                    const pts = curve([base, add(base, s([0.02, 0.12 * hs, -0.06 * hs])), add(base, s([0.05 * hs, 0.17 * hs, -0.2 * hs])), add(base, s([0.07 * hs, 0.12 * hs, -0.3 * hs]))], 12);
                    out.push({ mesh: hornTube(pts, 0.024 * hs, 0.003), kind: 'horn', weights: rigid('Head'), tag: 'horn' });
                } else if (r.horns === 'dragon') {
                    for (const [k, size] of [[0, 1], [1, 0.55]]) {
                        const b = add(base, s([k * 0.02, -k * sr * 0.4, -k * sr * 0.3]));
                        const pts = curve([b, add(b, s([0.03 * hs * size, 0.1 * hs * size, -0.12 * hs * size])), add(b, s([0.05 * hs * size, 0.15 * hs * size, -0.32 * hs * size])), add(b, s([0.06 * hs * size, 0.22 * hs * size, -0.45 * hs * size]))], 12);
                        out.push({ mesh: hornTube(pts, 0.03 * hs * size, 0.003), kind: 'horn', weights: rigid('Head'), tag: 'horn' });
                    }
                } else if (r.horns === 'antlers') {
                    // A main beam up and back, curving forward, with tines off its front.
                    const b = add(base, s([0, 0.0, -0.01]));
                    const beam = curve([b, add(b, s([0.08 * hs, 0.12 * hs, -0.06 * hs])), add(b, s([0.18 * hs, 0.28 * hs, -0.04 * hs])), add(b, s([0.2 * hs, 0.42 * hs, 0.06 * hs])), add(b, s([0.16 * hs, 0.52 * hs, 0.12 * hs]))], 16);
                    out.push({ mesh: hornTube(beam, 0.018 * hs, 0.005, 8), kind: 'horn', weights: rigid('Head'), tag: 'horn' });
                    for (const [at, l, lift] of [[0.15, 0.12, 0.6], [0.45, 0.14, 1], [0.7, 0.12, 1.1], [0.88, 0.09, 1]]) {
                        const i = Math.round(at * (beam.length - 1));
                        const p = beam[i];
                        const tine = curve([p, add(p, s([0.0, 0.05 * hs * lift, 0.05 * hs])), add(p, s([-0.01 * hs, l * hs * lift, l * hs * 0.55]))], 6);
                        out.push({ mesh: hornTube(tine, 0.011 * hs, 0.003, 7), kind: 'horn', weights: rigid('Head'), tag: 'horn' });
                    }
                }
            }
            if (r.horns === 'unicorn') {
                const b = add(J.skull, add(mul(hd, sr * 0.55), [0, sr * 0.65, 0]));
                const dir = norm(add(mul(hd, 0.75), [0, 0.9, 0]));
                const pts = curve([b, add(b, mul(dir, 0.2 * hs)), add(b, mul(dir, 0.42 * hs))], 14);
                const mesh = loft(pts, t => { const v = (0.028 * (1 - t) + 0.002) * hs * (1 + 0.12 * Math.sin(t * 40)); return [v, v]; }, 10, null, true);
                out.push({ mesh, kind: 'horn', weights: rigid('Head'), tag: 'horn' });
            } else if (r.horns === 'rhino') {
                const b = add(lerp(J.skull, J.snoutTip, 0.82), [0, sr * 0.3, 0]);
                const pts = curve([b, add(b, [0, 0.12 * hs, 0.03 * hs]), add(b, [0, 0.22 * hs, -0.02 * hs])], 10);
                out.push({ mesh: hornTube(pts, 0.05 * hs, 0.004), kind: 'horn', weights: rigid('Head'), tag: 'horn' });
            }
        }
        // Tusks: out of the lower jaw near the snout tip, up and back.
        if (r.tuskSize > 0) {
            const ts = r.tuskSize * ht;
            for (const side of [1, -1]) {
                const b = add(lerp(J.skull, J.snoutTip, 0.78), [side * sr * 0.32 * r.snoutWidth, -sr * 0.32, 0]);
                const pts = curve([b, add(b, [side * 0.03 * ts, 0.04 * ts, 0.02 * ts]), add(b, [side * 0.05 * ts, 0.09 * ts, -0.02 * ts])], 8);
                out.push({ mesh: loft(pts, t => { const v = (0.016 * (1 - t) + 0.002) * ts; return [v, v]; }, 8, null, true), kind: 'horn', weights: rigid('Head'), tag: 'tusk' });
            }
        }
        // A nine-banded armadillo's carapace (after photos and the ADW/Wikipedia accounts): one high, rounded dome
        // arched from the shoulders to the rump and hanging low over the legs as a skirt, made of a rigid
        // shoulder (scapular) shield, nine narrow flexible bands at mid-body, each lapping over the next, and a
        // rigid hip (pelvic) shield that curves down over the rump; the shields pebbled with small round scutes,
        // the bands with a row of narrow tapering ones. The dome is its own shape, pushed out wherever the body
        // would show through it.
        if (r.kind === 'armadillo' && lay.shapes) {
            const se = (x, n) => Math.sign(x) * Math.abs(x) ** (2 / n), fr = x => x - Math.floor(x);
            const shapes = lay.shapes, zF = lay.spineF[2] + 0.22 * g, zR = lay.spineR[2] - 0.5 * g, rows = 96, cols = 64, bands = 9, b0 = 0.36, b1 = 0.66;
            const yAt = u => lay.spineF[1] + (lay.spineR[1] - lay.spineF[1]) * u - 0.14 * g;
            // The body's own extent under the shell, for its size: the dome stands over its top and well out past its
            // flanks, its rim low over the legs so only their lower parts show.
            let T0 = 0, W0 = 0;
            for (let i = 0; i <= 8; i++) {
                const u = 0.25 + 0.5 * i / 8, c = [0, yAt(u), zF + (zR - zF) * u];
                T0 = Math.max(T0, surfaceAlong(shapes, c, [0, 1, 0], g)[1]);
                W0 = Math.max(W0, surfaceAlong(shapes, c, [1, 0, 0], g)[0]);
            }
            const topMax = T0 + 0.035 * g + 0.12 * T0, rimY = u => topMax * (0.3 + 0.2 * smooth(0.3, 0, u) + 0.05 * smooth(0.72, 1, u));
            const topY = u => rimY(u) + (topMax - rimY(u)) * Math.sqrt(Math.max(0, 1 - ((u - 0.5) / 0.58) ** 2));
            const halfW = u => W0 * 1.22 * Math.sqrt(Math.max(0, 1 - ((u - 0.5) / 0.6) ** 2));
            const bandAt = u => u > b0 && u < b1 ? ((u - b0) / (b1 - b0) * bands) % 1 : -1;
            // Scutes: the shields' small round ones in offset rows, the bands' one row of narrow ones.
            const cellAt = (u, v) => {
                const band = bandAt(u);
                if (band >= 0) { const x = v * 46, f = x - Math.floor(x); return { bump: Math.sin(Math.PI * f) * smooth(0, 0.3, band) * (1 - smooth(0.8, 1, band)), edge: smooth(0.75, 1, band) }; }
                const y = u * 64, j = Math.floor(y), x = v * 30 + (j % 2) * 0.5, fx = x - Math.floor(x) - 0.5, fy = y - j - 0.5, d = Math.hypot(fx, fy * 1.1) * 2;
                return { bump: Math.max(0, 1 - d * d), edge: smooth(0.7, 1, d) };
            };
            const positions = [], index = [], tv = [], info = [], grid = [];
            for (let i = 0; i < rows; i++) {
                const u = i / (rows - 1), z = zF + (zR - zF) * u, c = [0, rimY(u), z], inner = [0, yAt(u), z];
                const T = topY(u) - rimY(u), W = halfW(u);
                const band = bandAt(u), lap = band >= 0 ? 0.05 * T * (smooth(0, 0.85, band) - 0.5) * (1 - smooth(0.85, 1, band) * 1.4) : 0;
                const row = [];
                for (let k = 0; k < cols; k++) {
                    // Round the dome from one rim over the top to the other, the sides falling near-straight to the
                    // rim and tucking in a little under it.
                    const v = k / (cols - 1) * 2 - 1, a = v * Math.PI / 2 * 1.06, cell = cellAt(u, v);
                    let p = [W * se(Math.sin(a), 2.4) * (1 - 0.05 * smooth(1, 1.06, Math.abs(v) * 1.06)), T * se(Math.cos(a), 2.4), 0];
                    const dir0 = norm([p[0] / Math.max(W, 1e-4), p[1] / Math.max(T, 1e-4) + 1e-6, 0]);
                    p = add(c, add(p, mul(dir0, lap + 0.007 * T * cell.bump)));
                    // Wherever the body would show through, the shell stands off it.
                    const dir = norm(sub(p, inner)), sp = surfaceAlong(shapes, inner, dir, g), need = len(sub(sp, inner)) + 0.012 * g;
                    if (len(sub(p, inner)) < need) p = add(inner, mul(dir, need));
                    row.push([p, sub(p, mul(dir0, 0.01 * g + 0.02 * T)), u, v, cell]);
                }
                grid.push(row);
            }
            let shellNotch = null;
            // The hip shield closes down over the rump: past the last row the shell wraps round behind the
            // hindquarters like the end of an egg, each column curving in and down to an arched notch at its
            // foot that stands just over the tail where the tail leaves the body, so the tail comes out from
            // under the shield's rear rim (the rim lapping over its base), never through the shell.
            {
                const last = grid[grid.length - 1], cB = [0, rimY(1), zR], depth = (zF - zR) * 0.12, nCap = 12, zN = zR - depth;
                let notch = null;
                if (r.tail !== 'none' && J.tail && J.tail.length > 1) {
                    const acc = [0]; for (let i = 1; i < J.tail.length; i++) acc.push(acc[i - 1] + len(sub(J.tail[i], J.tail[i - 1])));
                    for (let i = 1; i < J.tail.length && !notch; i++) {
                        const a0 = J.tail[i - 1], a1 = J.tail[i];
                        if ((a0[2] - zN) * (a1[2] - zN) > 0) continue;
                        const f = (a0[2] - zN) / ((a0[2] - a1[2]) || 1e-9), c = lerp(a0, a1, f), t = (acc[i - 1] + f * (acc[i] - acc[i - 1])) / acc[acc.length - 1];
                        // The tail's own radius there (its rings stand 9% proud), with room for its sway.
                        const rr = (0.078 * (1 - 0.9 * t ** 0.75) + 0.004) * r.tailThickness * g * 1.09;
                        notch = { c, r: rr * 1.22 + 0.006 * g };
                    }
                }
                const ends = last.map(([p0, , , v]) => notch ? add(notch.c, [notch.r * Math.sin(v * Math.PI / 2) * 1.15, notch.r * Math.cos(v * Math.PI / 2), 0]) : [0, cB[1], zN]);
                for (let j = 1; j <= nCap; j++) {
                    const th = j / nCap * Math.PI / 2, shrink = Math.cos(th), back = Math.sin(th);
                    const row = last.map(([p0, , u0, v, cell], k) => {
                        const E = ends[k], p = notch ? [E[0] + (p0[0] - E[0]) * shrink, E[1] + (p0[1] - E[1]) * shrink, p0[2] - depth * back]
                            : add(cB, [(p0[0] - cB[0]) * shrink, (p0[1] - cB[1]) * (0.25 + 0.75 * shrink), (p0[2] - cB[2]) * shrink - depth * back]);
                        const dir = norm(add(sub(p, notch ? notch.c : cB), [0, 1e-6, 0])), inner = add(cB, [0, (yAt(1) - cB[1]) * 0.5, depth * 0.3]);
                        const sp = surfaceAlong(shapes, inner, norm(sub(p, inner)), g), need = len(sub(sp, inner)) + 0.012 * g;
                        // (Only the rump pushes it out: never along the tail, which runs on out under it.)
                        const q = j < nCap * 0.7 && len(sub(p, inner)) < need && need < len(sub(p, inner)) * 1.25 ? add(inner, mul(norm(sub(p, inner)), need)) : p;
                        return [q, sub(q, mul(dir, 0.01 * g + 0.006 * T0)), 0.95, v, cellAt(0.99 - 0.004 * j, v)];
                    });
                    grid.push(row);
                }
                shellNotch = notch && { c: notch.c.slice(), r: notch.r, z: zN };
            }
            const nr = grid.length;
            const vid = (i, k, side) => (i * cols + k) * 2 + side;
            for (let i = 0; i < nr; i++) for (let k = 0; k < cols; k++) for (const side of [0, 1]) { const q = grid[i][k]; positions.push(...q[side]); tv.push(q[2]); info.push(q); }
            for (let i = 0; i + 1 < nr; i++) for (let k = 0; k + 1 < cols; k++) {
                index.push(vid(i, k, 0), vid(i, k + 1, 0), vid(i + 1, k, 0), vid(i, k + 1, 0), vid(i + 1, k + 1, 0), vid(i + 1, k, 0));
                index.push(vid(i, k, 1), vid(i + 1, k, 1), vid(i, k + 1, 1), vid(i, k + 1, 1), vid(i + 1, k, 1), vid(i + 1, k + 1, 1));
            }
            // The rim: outer to inner round all four edges.
            for (let i = 0; i + 1 < nr; i++) { index.push(vid(i, 0, 0), vid(i + 1, 0, 0), vid(i, 0, 1), vid(i + 1, 0, 0), vid(i + 1, 0, 1), vid(i, 0, 1)); const k = cols - 1; index.push(vid(i, k, 0), vid(i, k, 1), vid(i + 1, k, 0), vid(i + 1, k, 0), vid(i, k, 1), vid(i + 1, k, 1)); }
            for (let k = 0; k + 1 < cols; k++) { index.push(vid(0, k, 0), vid(0, k, 1), vid(0, k + 1, 0), vid(0, k + 1, 0), vid(0, k, 1), vid(0, k + 1, 1)); const i = nr - 1; index.push(vid(i, k, 0), vid(i, k + 1, 0), vid(i, k, 1), vid(i, k + 1, 0), vid(i, k + 1, 1), vid(i, k, 1)); }
            const weights = t => t < 0.3 ? [['Chest', 1]] : t < 0.5 ? [['Chest', (0.5 - t) / 0.2], ['Spine', (t - 0.3) / 0.2]] : t < 0.7 ? [['Spine', (0.7 - t) / 0.2], ['Hips', (t - 0.5) / 0.2]] : [['Hips', 1]];
            // Colour: grey-brown scutes with paler seams, each band's rear edge pale, the skirt's edge yellowish pink.
            const paint = (C0, i) => {
                const [, , u, v, cell] = info[i], band = bandAt(u), rim = smooth(0.9, 1, Math.abs(v)) + smooth(0.03, 0, u) + smooth(0.97, 1, u);
                let col = mixRgb(mul(C0.horn, 0.9 + 0.16 * cell.bump), C0.light, 0.22 * cell.edge);
                if (band >= 0) col = mixRgb(col, mul(C0.horn, 0.7), 0.35 * smooth(0.25, 0, band));
                return mixRgb(col, mixRgb(C0.light, [0.85, 0.66, 0.58], 0.3), 0.55 * Math.min(1, rim));
            };
            out.push({ mesh: { positions, index, t: tv }, kind: 'horn', weights, tag: 'shell', paint });
            lay.shell = { zF, zR, T0, W0, bands, b0, b1, yAt, notch: shellNotch };
            // The head shield: a long tapering plate of small scutes over the crown and down the top of the snout,
            // lying on the head; between the ears at the back, ending short of the nose.
            if (lay.headShapes && J.mouth) {
                const H = lay.H, hu = J.hup, hs = lay.headShapes, zA = -0.42, zB = J.mouth.zt - 0.32, nr = 30, nc = 17, hp = [], hi = [], ht2 = [];
                for (let i = 0; i < nr; i++) {
                    const tz = i / (nr - 1), z = zA + (zB - zA) * tz, from = H(0, 0, z), wSide = len(sub(surfaceAlong(hs, from, [1, 0, 0], g), from));
                    for (let k = 0; k < nc; k++) {
                        const x = (k / (nc - 1) * 2 - 1) * (0.78 - 0.2 * tz), dir = norm(add(mul(hu, 1), [x * 1.4, 0, 0]));
                        const sp = surfaceAlong(hs, from, dir, g), cy = (i * 0.5) % 1, cx = (k * 0.5 + (i % 2) * 0.25) % 1;
                        const bump = Math.sin(Math.PI * fr(i / 2.2)) * Math.sin(Math.PI * fr(k / 2 + (Math.floor(i / 2.2) % 2) * 0.5));
                        const edge = smooth(0.8, 1, Math.abs(x) / (0.78 - 0.2 * tz)) + smooth(0.05, 0, tz) + smooth(0.92, 1, tz);
                        hp.push(...add(sp, mul(dir, (0.03 + 0.012 * bump) * sr * (1 - 0.6 * Math.min(1, edge)) + 0.002 * g)));
                        ht2.push(tz); hi.push([bump, edge, wSide]);
                    }
                }
                const idx = [];
                for (let i = 0; i + 1 < nr; i++) for (let k = 0; k + 1 < nc; k++) { const a = i * nc + k; idx.push(a, a + nc, a + 1, a + 1, a + nc, a + nc + 1); }
                out.push({ mesh: { positions: hp, index: idx, t: ht2 }, kind: 'horn', weights: rigid('Head'), tag: 'shell', paint: (C0, i) => mixRgb(mul(C0.horn, 0.9 + 0.12 * hi[i][0]), mixRgb(C0.light, [0.85, 0.66, 0.58], 0.3), 0.3 * smooth(0.4, 0, hi[i][0]) + 0.3 * Math.min(1, hi[i][1])) });
            }
        }
        // A pig's rhinarium: a short tube of even girth, a slight rim, then a flat face with two oval nostrils.
        if (lay.pigDisc) {
            const d = lay.pigDisc, H = lay.H, zs = [-0.12, -0.06, 0, 0.05, 0.09, 0.115, 0.13, 0.134, 0.136, 0.137, 0.1375], rs = [0.94, 0.96, 0.98, 1.0, 1.03, 1.05, 1.03, 0.82, 0.58, 0.32, 0.06];
            const mesh = loft(zs.map(z => H(0, 0, d.z + z)), t => { const k = rs[Math.round(t * (rs.length - 1))]; return [d.rx * sr * k, d.ry * sr * k]; }, 28, null, false);
            const holes = [1, -1].map(s => H(s * d.holeX, 0, d.z + 0.136)), hr = [0.055 * sr, 0.075 * sr];
            const inHole = p => Math.min(...holes.map(h => { const q = sub(p, h); return Math.hypot(q[0] / hr[0], (q[1] * J.hup[1] + q[2] * J.hup[2]) / hr[1]); }));
            // The nostrils sink into the face.
            for (let i = 0; i < mesh.positions.length / 3; i++) if (mesh.t[i] > 0.65) { const p = [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]], k = Math.max(0, 1 - inHole(p)); for (let a = 0; a < 3; a++) mesh.positions[i * 3 + a] -= hd[a] * sr * 0.05 * k; }
            out.push({ mesh, kind: 'horn', weights: rigid('Head'), tag: 'disc', inHole });
        }
        // Back spines: a row of cones from the head down the neck, the back and the tail.
        if (r.spines > 0) {
            const sp = r.spines * g;
            const line = [...curve([J.atlas, lerp(J.atlas, J.neck, 0.5), add(J.neck, [0, 0.18 * g, -0.05])], 6), ...curve([lay.spineF, lerp(lay.spineF, lay.spineR, 0.5), lay.spineR], 8), ...(J.tail.length > 1 ? curve(J.tail, 8) : [])];
            const boneAt = i => (i < 6 ? 'Neck' : i < 10 ? 'Chest' : i < 14 ? 'Spine' : i < 16 ? 'Hips' : i < 19 ? 'Tail' : i < 21 ? 'Tail2' : 'Tail3');
            line.forEach((p, i) => {
                const fade = i >= 14 ? 1 - (i - 14) / Math.max(1, line.length - 14) * 0.7 : 1;
                const h = 0.07 * sp * fade, w = 0.022 * sp * fade;
                // Out of the body: a little below the line, leaning back.
                const b = add(p, [0, -h * 0.25, 0]);
                const pts = [b, add(b, [0, h * 0.6, -h * 0.25]), add(b, [0, h, -h * 0.55])];
                out.push({ mesh: loft(pts, t => [w * (1 - t) + 0.001, w * 0.45 * (1 - t) + 0.001], 6, [0, 0, 1], false), kind: 'horn', weights: () => [[boneAt(i), 1]], tag: 'spine' });
            });
        }
        return out;
    }

    /**
     * One wing (the left; the right is its mirror): the arm and fingers as
     * thin tubes, and the membrane as panels between the fingers and down to
     * the flank, scalloped (bat) or ragged with feather tips (feathered).
     * Vertices carry [x, y, z], a color key and how far out on the wing they
     * are (0 at the body).
     */
    function wingOf(r, lay) {
        const W = lay.J.wing, g = lay.g, ws = r.wingSize * Math.max(0.8, lay.bl);
        const positions = [], index = [], tone = [], reach = [];
        const bodyLine = [W.root, W.flank];
        const outFromBody = p => {
            const ab = sub(bodyLine[1], bodyLine[0]), t = clamp(dot(sub(p, bodyLine[0]), ab) / dot(ab, ab), 0, 1);
            return len(sub(p, add(bodyLine[0], mul(ab, t))));
        };
        const put = (p, key) => { positions.push(p[0], p[1], p[2]); tone.push(key); reach.push(outFromBody(p)); return positions.length / 3 - 1; };
        const tube = (pts, r0, r1) => {
            const m = loft(pts, t => { const v = r0 + (r1 - r0) * t; return [v, v]; }, 6, null, true);
            const base = positions.length / 3;
            for (let i = 0; i < m.positions.length; i += 3) put([m.positions[i], m.positions[i + 1], m.positions[i + 2]], 'bone');
            for (const q of m.index) index.push(q + base);
        };
        const arm = curve([W.root, W.elbow, W.wrist], 10);
        tube(arm, 0.03 * g * ws, 0.016 * g * ws);
        const fingers = W.tips.map((tip, i) => curve([W.wrist, add(lerp(W.wrist, tip, 0.55), [0, 0.03 * ws * (1 - i * 0.3), 0]), tip], 10));
        for (const f of fingers) tube(f, 0.012 * g * ws, 0.003);
        const feathered = r.wings === 'feathered';
        // A panel between two lines of the same count: a grid across, the far edge pulled in between the tips.
        const panel = (A, Bl, cols, sag, key) => {
            const rows = A.length;
            const grid = [];
            for (let i = 0; i < rows; i++) {
                if (len(sub(A[i], Bl[i])) < 1e-9) {
                    // Fingers share the wrist: a single fan root avoids collapsed quads there.
                    grid.push(Array(cols + 1).fill(put(A[i], key(i / (rows - 1), 0))));
                    continue;
                }
                const row = [];
                for (let j = 0; j <= cols; j++) {
                    const u = j / cols;
                    let p = lerp(A[i], Bl[i], u);
                    const far = i / (rows - 1);
                    let pull = sag * Math.sin(Math.PI * u) * far * far;
                    if (feathered) pull -= 0.05 * far * far * (((j % 2) ? 1 : 0) - 0.3);
                    p = lerp(p, W.wrist, clamp(pull, -0.2, 0.6));
                    row.push(put(p, key(far, u)));
                }
                grid.push(row);
            }
            for (let i = 0; i + 1 < rows; i++) for (let j = 0; j < cols; j++) {
                const a = grid[i][j], b2 = grid[i][j + 1], c = grid[i + 1][j], d = grid[i + 1][j + 1];
                if (a !== c && c !== b2 && a !== b2) index.push(a, c, b2);
                if (b2 !== c && c !== d && b2 !== d) index.push(b2, c, d);
            }
        };
        const feather = (far, u) => (feathered ? (far > 0.55 ? (Math.floor(u * 8) % 2 ? 'marking' : 'flight') : 'coat') : 'membrane');
        for (let k = 0; k + 1 < fingers.length; k++) panel(fingers[k], fingers[k + 1], feathered ? 8 : 4, feathered ? 0.05 : 0.22, feather);
        // From the last finger down to the flank, and the fold under the arm.
        const sideLine = curve([W.root, lerp(W.root, W.flank, 0.5), W.flank], fingers[0].length);
        panel(fingers[fingers.length - 1], sideLine, feathered ? 8 : 5, feathered ? 0.05 : 0.18, feather);
        const fold = [put(W.root, feathered ? 'coat' : 'membrane'), put(W.elbow, feathered ? 'coat' : 'membrane'), put(W.wrist, feathered ? 'coat' : 'membrane')];
        index.push(fold[0], fold[1], fold[2]);
        return { positions, index, tone, reach, ws };
    }

    // ── surface nets over a narrow band ────────────────────────────────────
    /**
     * Meshes the field of `shapes` at `cell`: the grid is walked in blocks of
     * four cells, a block far from every shape or wholly inside or outside
     * (judged at its center) takes one value, and only blocks the surface may
     * cross are sampled point by point, each over the shapes that can reach
     * it. Returns { positions, index, near(p) → the shape list for a point }.
     */
    function surfaceNet(shapes, cell, fieldNoise) {
        // The widest blends first, so each shape's reach is its own blend and the details settle onto the masses.
        const list = shapes.filter(s => !s.cut).sort((a, b) => b.k - a.k).concat(shapes.filter(s => s.cut));
        const noiseAmp = fieldNoise ? fieldNoise.amp : 0;
        let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const s of list) {
            if (s.cut) continue;
            const m = s.k + (s.bump || 0);
            for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], s.lo[i] - m); hi[i] = Math.max(hi[i], s.hi[i] + m); }
        }
        const pad = cell * 3 + noiseAmp;
        lo = lo.map(v => v - pad); hi = hi.map(v => v + pad);
        lo[1] = Math.max(lo[1], -cell * 2);
        const BS = 4;
        const X = Math.ceil((hi[0] - lo[0]) / cell / BS) * BS + 1, Y = Math.ceil((hi[1] - lo[1]) / cell / BS) * BS + 1, Z = Math.ceil((hi[2] - lo[2]) / cell / BS) * BS + 1;
        const BX = Math.ceil(X / BS), BY = Math.ceil(Y / BS), BZ = Math.ceil(Z / BS);
        const blockValue = new Float32Array(BX * BY * BZ);
        const blockAt = new Int32Array(BX * BY * BZ).fill(-1);
        const lists = new Array(BX * BY * BZ);
        const pool = [];
        // A shape reaches as far as its own blend, or a later one's: the nearest shape so far sets what the next blends with.
        const laterK = new Float64Array(list.length);
        for (let i = list.length - 2; i >= 0; i--) laterK[i] = Math.max(laterK[i + 1], list[i + 1].k);
        const reachOf = list.map((s, i) => Math.max(s.k, laterK[i]) + (s.bump || 0) + cell * 2 + noiseAmp);
        const half = (BS - 1) / 2 * cell * Math.sqrt(3);
        const p = [0, 0, 0];
        const sample = fieldNoise && fieldNoise.amp > 0
            ? (cand, q) => { const d = fieldAt(cand, q); return Math.abs(d) < noiseAmp * 2 + cell * 2 ? Math.max(d - noiseAmp * fieldNoise.at(q[0], q[1], q[2]), -q[1]) : d; }
            : fieldAt;
        const near = [];
        for (let bk = 0; bk < BZ; bk++) for (let bj = 0; bj < BY; bj++) for (let bi = 0; bi < BX; bi++) {
            const b = (bk * BY + bj) * BX + bi;
            const x0 = lo[0] + bi * BS * cell, y0 = lo[1] + bj * BS * cell, z0 = lo[2] + bk * BS * cell;
            const x1 = x0 + (BS - 1) * cell, y1 = y0 + (BS - 1) * cell, z1 = z0 + (BS - 1) * cell;
            const cand = [];
            // A flattened shape's field grows faster than the distance by its flattening: the block is judged by that.
            let lip = 1;
            for (let s = 0; s < list.length; s++) {
                const sh = list[s], rc = reachOf[s];
                if (sh.lo[0] - rc > x1 || sh.hi[0] + rc < x0 || sh.lo[1] - rc > y1 || sh.hi[1] + rc < y0 || sh.lo[2] - rc > z1 || sh.hi[2] + rc < z0) continue;
                cand.push(sh);
                if (sh.fx > lip) lip = sh.fx;
                if (sh.fz > lip) lip = sh.fz;
            }
            if (!cand.length || cand.every(s => s.cut)) { blockValue[b] = 1e3; continue; }
            p[0] = (x0 + x1) / 2; p[1] = (y0 + y1) / 2; p[2] = (z0 + z1) / 2;
            const d0 = fieldAt(cand, p);
            if (Math.abs(d0) > (half * 1.6 + cell * 2 + noiseAmp * 2) * lip) { blockValue[b] = d0; continue; }
            lists[b] = cand;
            blockAt[b] = pool.length;
            const vals = new Float32Array(BS * BS * BS);
            for (let k = 0; k < BS; k++) for (let j = 0; j < BS; j++) for (let i = 0; i < BS; i++) {
                p[0] = x0 + i * cell; p[1] = y0 + j * cell; p[2] = z0 + k * cell;
                vals[(k * BS + j) * BS + i] = sample(cand, p);
            }
            pool.push(vals);
            near.push(b);
        }
        const val = (i, j, k) => {
            const b = ((k >> 2) * BY + (j >> 2)) * BX + (i >> 2), at = blockAt[b];
            return at < 0 ? blockValue[b] : pool[at][((k & 3) * BS + (j & 3)) * BS + (i & 3)];
        };
        const cubeVertex = new Map();
        const verts = [];
        const vblock = [];
        const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
        const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
        const v = new Float64Array(8);
        const vertexOf = (i, j, k) => {
            const key = (k * Y + j) * X + i;
            const known = cubeVertex.get(key);
            if (known !== undefined) return known;
            for (let c = 0; c < 8; c++) v[c] = val(i + (c & 1), j + ((c >> 1) & 1), k + (c >> 2));
            let sx = 0, sy = 0, sz = 0, n = 0;
            for (const [a, b] of edges) {
                if ((v[a] < 0) === (v[b] < 0)) continue;
                const t = v[a] / (v[a] - v[b]);
                const pa = corners[a], pb = corners[b];
                sx += pa[0] + (pb[0] - pa[0]) * t; sy += pa[1] + (pb[1] - pa[1]) * t; sz += pa[2] + (pb[2] - pa[2]) * t; n++;
            }
            if (!n) { sx = sy = sz = 0.5; n = 1; }
            verts.push(lo[0] + (i + sx / n) * cell, lo[1] + (j + sy / n) * cell, lo[2] + (k + sz / n) * cell);
            vblock.push(((k >> 2) * BY + (j >> 2)) * BX + (i >> 2));
            const id = verts.length / 3 - 1;
            cubeVertex.set(key, id);
            return id;
        };
        const index = [];
        const quad = (a, b, c, d, flip) => {
            // Split along the shorter diagonal.
            const ac = Math.hypot(verts[a * 3] - verts[c * 3], verts[a * 3 + 1] - verts[c * 3 + 1], verts[a * 3 + 2] - verts[c * 3 + 2]);
            const bd = Math.hypot(verts[b * 3] - verts[d * 3], verts[b * 3 + 1] - verts[d * 3 + 1], verts[b * 3 + 2] - verts[d * 3 + 2]);
            const t = ac < bd ? [a, b, c, a, c, d] : [a, b, d, b, c, d];
            if (flip) for (let q = 0; q < 6; q += 3) { const x = t[q + 1]; t[q + 1] = t[q + 2]; t[q + 2] = x; }
            for (let q = 0; q < 6; q++) index.push(t[q]);
        };
        for (const b of near) {
            const bi = b % BX, bj = Math.floor(b / BX) % BY, bk = Math.floor(b / (BX * BY));
            for (let k = bk * BS; k < bk * BS + BS; k++) for (let j = bj * BS; j < bj * BS + BS; j++) for (let i = bi * BS; i < bi * BS + BS; i++) {
                if (i < 1 || j < 1 || k < 1 || i >= X - 1 || j >= Y - 1 || k >= Z - 1) continue;
                const inside = val(i, j, k) < 0;
                if ((val(i + 1, j, k) < 0) !== inside) quad(vertexOf(i, j - 1, k - 1), vertexOf(i, j, k - 1), vertexOf(i, j, k), vertexOf(i, j - 1, k), !inside);
                if ((val(i, j + 1, k) < 0) !== inside) quad(vertexOf(i - 1, j, k - 1), vertexOf(i - 1, j, k), vertexOf(i, j, k), vertexOf(i, j, k - 1), !inside);
                if ((val(i, j, k + 1) < 0) !== inside) quad(vertexOf(i - 1, j - 1, k), vertexOf(i, j - 1, k), vertexOf(i, j, k), vertexOf(i - 1, j, k), !inside);
            }
        }
        const nearList = q => {
            const bi = clamp(Math.floor((q[0] - lo[0]) / cell / BS), 0, BX - 1), bj = clamp(Math.floor((q[1] - lo[1]) / cell / BS), 0, BY - 1), bk = clamp(Math.floor((q[2] - lo[2]) / cell / BS), 0, BZ - 1);
            return lists[(bk * BY + bj) * BX + bi] || list;
        };
        return { positions: new Float32Array(verts), index, near: nearList, list };
    }

    /** Vertex neighbors as compressed rows. */
    function neighbors(n, index) {
        const count = new Int32Array(n + 1);
        for (let t = 0; t < index.length; t++) count[index[t] + 1] += 2;
        for (let v = 0; v < n; v++) count[v + 1] += count[v];
        const fill = count.slice(0, n), list = new Int32Array(count[n]);
        for (let t = 0; t < index.length; t += 3) {
            const a = index[t], b = index[t + 1], c = index[t + 2];
            list[fill[a]++] = b; list[fill[a]++] = c; list[fill[b]++] = a; list[fill[b]++] = c; list[fill[c]++] = a; list[fill[c]++] = b;
        }
        return { start: count, list };
    }

    /** Taubin smoothing (a shrink and an equal swell a pass), so stair steps ease and nothing thins; the floor stays. */
    function relaxMesh(positions, index, passes) {
        const n = positions.length / 3;
        const { start, list } = neighbors(n, index);
        let p = Float32Array.from(positions);
        const step = (src, f) => {
            const q = new Float32Array(src.length);
            for (let v = 0; v < n; v++) {
                let x = 0, y = 0, z = 0;
                const s0 = start[v], s1 = start[v + 1], c = (s1 - s0) || 1;
                for (let i = s0; i < s1; i++) { const u = list[i]; x += src[u * 3]; y += src[u * 3 + 1]; z += src[u * 3 + 2]; }
                q[v * 3] = src[v * 3] + (x / c - src[v * 3]) * f;
                q[v * 3 + 1] = src[v * 3 + 1] < 1e-4 ? src[v * 3 + 1] : src[v * 3 + 1] + (y / c - src[v * 3 + 1]) * f;
                q[v * 3 + 2] = src[v * 3 + 2] + (z / c - src[v * 3 + 2]) * f;
            }
            return q;
        };
        for (let pass = 0; pass < passes; pass++) p = step(step(p, 0.5), -0.53);
        return p;
    }

    /** Each vertex moved onto the field's zero along its gradient. */
    function projectMesh(positions, net, cell) {
        const h = cell * 0.35;
        const q = [0, 0, 0];
        for (let v = 0; v < positions.length; v += 3) {
            const p = [positions[v], positions[v + 1], positions[v + 2]];
            const cand = net.near(p);
            for (let it = 0; it < 2; it++) {
                const d = fieldAt(cand, p);
                if (Math.abs(d) < cell * 0.01) break;
                q[0] = p[0] + h; q[1] = p[1]; q[2] = p[2]; const dx1 = fieldAt(cand, q); q[0] = p[0] - h; const dx0 = fieldAt(cand, q); q[0] = p[0];
                q[1] = p[1] + h; const dy1 = fieldAt(cand, q); q[1] = p[1] - h; const dy0 = fieldAt(cand, q); q[1] = p[1];
                q[2] = p[2] + h; const dz1 = fieldAt(cand, q); q[2] = p[2] - h; const dz0 = fieldAt(cand, q);
                const gx = (dx1 - dx0) / (2 * h), gy = (dy1 - dy0) / (2 * h), gz = (dz1 - dz0) / (2 * h), g2 = gx * gx + gy * gy + gz * gz;
                if (g2 < 1e-8) break;
                const s = clamp(d / g2, -cell, cell);
                p[0] -= gx * s; p[1] -= gy * s; p[2] -= gz * s;
            }
            positions[v] = p[0]; positions[v + 1] = Math.max(0, p[1]); positions[v + 2] = p[2];
        }
        return positions;
    }

    function faceNormals(positions, index) {
        const n = new Float32Array(positions.length);
        for (let t = 0; t < index.length; t += 3) {
            const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
            const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
            const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            for (const s of [a, b, c]) { n[s] += nx; n[s + 1] += ny; n[s + 2] += nz; }
        }
        for (let i = 0; i < n.length; i += 3) {
            const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
            n[i] /= l; n[i + 1] /= l; n[i + 2] /= l;
        }
        return n;
    }

    /** Fine iris fibers and a smooth pupil, independent of the eye sphere's triangle resolution. */
    /**
     * Every four-legged kind's eye picture: the iris (fine radial fibres, a paler collarette round the pupil,
     * a dark limbal ring), the pupil by species (`slit` a cat's upright lens, `fox` a fox's narrow slit,
     * `round`, `bar` a horse's or cow's wide horizontal oval with its corpora nigra, `goat` a ram's
     * rectangle, `reptile` a dragon's needle slit in a flecked iris), the dark sclera round it (mostly hidden
     * in the lids) and a wet highlight. Laid out as the eyeball's front (u, v from -1 to 1, the iris to 0.9).
     */
    const eyePictures = new Map();
    function eyeTexture(color, pupil) {
        const key = color + ':' + pupil;
        if (eyePictures.has(key)) return eyePictures.get(key);
        const size = 256, data = new Uint8Array(size * size * 4), iris = hexRgb(color);
        const lum = 0.3 * iris[0] + 0.55 * iris[1] + 0.15 * iris[2], dark = lum < 0.18;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const u = (x + 0.5) / size * 2 - 1, v = (y + 0.5) / size * 2 - 1;
            const radius = Math.hypot(u, v), angle = Math.atan2(v, u), ri = radius / 0.9;
            // Fibres radiate from the pupil; crypts break them up; a paler collarette rings the pupil.
            const fibers = Math.sin(angle * 173 + ri * 29) * 0.06 + Math.sin(angle * 293 - ri * 43) * 0.04 + (hash3(Math.floor(angle * 40), Math.floor(ri * 9), 3, 7) - 0.5) * 0.08;
            const collar = Math.exp(-(((ri - 0.45) / 0.12) ** 2));
            const limbal = smooth(0.8, 0.98, ri);
            let rgb = iris.map((c, k) => (c + (dark ? 0.06 : 0) * [1, 0.7, 0.45][k]) * (0.92 + fibers + 0.14 * collar) * (1 - 0.6 * limbal));
            if (pupil === 'reptile') rgb = mixRgb(rgb, mixRgb(iris, [1, 0.9, 0.5], 0.4), 0.5 * Math.max(0, Math.sin(angle * 60 + ri * 8)) ** 6 * (1 - ri));
            // Outside the iris: the sclera, dark and wet (it shows only at the corners).
            if (ri > 1) rgb = mixRgb([0.16, 0.12, 0.1], [0.55, 0.47, 0.42], smooth(1.0, 1.08, ri) * 0.6);
            let p = 0;
            if (pupil === 'slit' || pupil === 'fox' || pupil === 'reptile') {
                const a = pupil === 'slit' ? 0.2 : pupil === 'fox' ? 0.1 : 0.075, b = pupil === 'reptile' ? 0.8 : 0.7;
                const w = a * Math.max(0, 1 - (v / b) ** 2);
                p = 1 - smooth(w * 0.85, w * 1.0 + 0.012, Math.abs(u));
            } else if (pupil === 'bar' || pupil === 'goat') {
                const a = pupil === 'bar' ? 0.52 : 0.58, b = pupil === 'bar' ? 0.25 : 0.17, e = pupil === 'bar' ? 2.6 : 5;
                const q = Math.pow(Math.abs(u / a), e) + Math.pow(Math.abs(v / b), e);
                // A horse's corpora nigra: dark nubs along the pupil's upper edge.
                const nigra = pupil === 'bar' ? Math.exp(-(((v - b * 0.95) / 0.07) ** 2)) * smooth(0.35, 0.1, Math.abs(u)) * (0.6 + 0.4 * Math.cos(u * 30)) : 0;
                p = Math.max(1 - smooth(0.85, 1.05, q), nigra * 0.9);
            } else {
                p = 1 - smooth(0.32, 0.345, radius);
            }
            rgb = mixRgb(rgb, [0.01, 0.011, 0.013], p);
            // The wet highlight: a soft window of the sky over the cornea, high on the eye.
            const glint = 1 - smooth(0.05, 0.09, Math.hypot(u * 0.8, v - 0.42));
            rgb = mixRgb(rgb, [0.95, 0.97, 1], glint * 0.85);
            const at = (y * size + x) * 4;
            for (let k = 0; k < 3; k++) data[at + k] = Math.round(clamp(rgb[k], 0, 1) * 255);
            data[at + 3] = 255;
        }
        const pic = { width: size, height: size, data, name: 'creature-eyes.png' };
        if (eyePictures.size > 16) eyePictures.delete(eyePictures.keys().next().value);
        eyePictures.set(key, pic);
        return pic;
    }

    /** An eye: a sphere whose pole looks along `facing`, rings close at the front so the iris and pupil are sharp. */
    function eyeball(c, rad, facing, up, rows, cols) {
        const f = norm(facing);
        let u = norm(sub(up, mul(f, dot(up, f))));
        const s = norm(cross(u, f));
        const positions = [], index = [], local = [];
        const put = (lx, ly, lz) => {
            const d = add(add(mul(s, lx), mul(u, ly)), mul(f, lz));
            positions.push(c[0] + d[0] * rad, c[1] + d[1] * rad, c[2] + d[2] * rad);
            local.push(lx, ly, lz);
        };
        // One vertex per pole: repeated pole rings created zero-area triangles and unlit normals.
        put(0, 0, 1);
        for (let i = 1; i < rows; i++) {
            const th = Math.pow(i / rows, 1.35) * Math.PI;
            for (let j = 0; j < cols; j++) {
                const ph = (j / cols) * Math.PI * 2;
                put(Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th));
            }
        }
        const end = positions.length / 3;
        put(0, 0, -1);
        for (let j = 0; j < cols; j++) index.push(0, 1 + j, 1 + (j + 1) % cols);
        for (let i = 0; i < rows - 2; i++) for (let j = 0; j < cols; j++) {
            const a = 1 + i * cols + j, b = a + cols, next = 1 + i * cols + (j + 1) % cols;
            index.push(a, b, next, next, b, next + cols);
        }
        for (let j = 0; j < cols; j++) index.push(end - cols + j, end, end - cols + (j + 1) % cols);
        return { positions, index, local };
    }

    // ── strands: a mane, a tail's tuft, a shaggy coat ──────────────────────
    let lockPicture = null;
    /**
     * The strand picture: four lanes, each a lock of hairs (sparse to dense),
     * full at the root and tapering out to uneven tips, lighter toward them.
     */
    function lockTexture() {
        if (lockPicture) return lockPicture;
        const W = 128, Hh = 256;
        const data = new Uint8Array(W * Hh * 4);
        const rand = rng(41);
        const alpha = new Float32Array(W * Hh), lum = new Float32Array(W * Hh).fill(0.8);
        for (let lane = 0; lane < 4; lane++) {
            const count = [14, 20, 28, 36][lane];
            for (let k = 0; k < count; k++) {
                const u0 = lane * 0.25 + 0.02 + rand() * 0.21, lenS = 0.55 + rand() * 0.45;
                const lean = (rand() - 0.5) * 0.06, w0 = (0.006 + 0.006 * rand()) * W, light = 0.7 + 0.45 * rand();
                for (let y = 0; y < Hh; y++) {
                    const vv = (y + 0.5) / Hh;
                    if (vv > lenS) break;
                    const t = vv / lenS;
                    const cu = (u0 + lean * t * t) * W, w = w0 * (1 - 0.75 * t);
                    for (let x = Math.max(lane * W / 4, Math.floor(cu - w - 1)); x <= Math.min((lane + 1) * W / 4 - 1, Math.ceil(cu + w + 1)); x++) {
                        const d = Math.abs(x + 0.5 - cu) / Math.max(0.5, w);
                        if (d > 1) continue;
                        const o = y * W + x, a = (1 - d * d) * Math.min(1, (1 - t) * 5);
                        if (a > alpha[o]) { alpha[o] = a; lum[o] = light; }
                    }
                }
            }
        }
        for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
            const o = y * W + x, vv = (y + 0.5) / Hh;
            const lu = ((x + 0.5) / W % 0.25) / 0.25, edge = Math.min(1, Math.min(lu, 1 - lu) * 5);
            const a = Math.max(alpha[o], Math.max(0, 0.85 - vv * 5) * edge);
            const l = Math.min(255, Math.round(255 * 1.15 * lum[o] * (0.8 + 0.25 * Math.min(1, vv * 1.4))));
            data[o * 4] = data[o * 4 + 1] = data[o * 4 + 2] = l;
            data[o * 4 + 3] = Math.round(255 * Math.min(1, a));
        }
        lockPicture = { width: W, height: Hh, data, name: 'creaturefur.png' };
        return lockPicture;
    }

    /**
     * Strand cards: each a narrow strip from its root on the body, out of the
     * skin and along its flow, bending under its own weight (three segments),
     * carrying a lane of the strand picture. `roots`: [{ p, n, flow, len,
     * width, color, tipColor, joints, weights, lift }].
     */
    function strandCards(roots, rand) {
        const SEG = 3, per = (SEG + 1) * 2;
        const n = roots.length;
        const positions = new Float32Array(n * per * 3), normals = new Float32Array(n * per * 3), uvs = new Float32Array(n * per * 2), colors = new Float32Array(n * per * 3);
        const joints = new Uint8Array(n * per * 4), weights = new Float32Array(n * per * 4), index = new Uint32Array(n * SEG * 6);
        let vi = 0, ii = 0;
        for (const s of roots) {
            const nr = s.n, f = norm(sub(s.flow, mul(nr, dot(s.flow, nr) * 0.85)));
            // The card's width across the flow, turned about it a little so neighbors do not lie in one plane.
            let wd = norm(cross(nr, f));
            const turn = (rand() - 0.5) * 1.2;
            wd = norm(add(mul(wd, Math.cos(turn)), mul(nr, Math.sin(turn))));
            const lane = s.lane != null ? s.lane : Math.floor(rand() * 4), u0 = lane * 0.25, u1 = u0 + 0.25;
            // A card may start past the picture's solid root band (`v0`), so it shows only loose hairs.
            const v0 = s.v0 != null ? s.v0 : 0.02;
            const base = vi;
            let p = s.p.slice();
            const step = s.len / SEG;
            for (let k = 0; k <= SEG; k++) {
                const t = k / SEG;
                if (k > 0) {
                    const lift = s.lift * (1 - t * 0.8);
                    const d = norm([f[0] + nr[0] * lift, f[1] + nr[1] * lift - (s.droop || 0.25) * t, f[2] + nr[2] * lift]);
                    p = add(p, mul(d, step));
                }
                const w = s.width * (1 - 0.35 * t);
                const col = mixRgb(s.color, s.tipColor || s.color, t);
                for (const side of [-1, 1]) {
                    const q = add(p, mul(wd, w * side));
                    positions.set(q, vi * 3);
                    normals.set(nr, vi * 3);
                    uvs[vi * 2] = side < 0 ? u0 : u1; uvs[vi * 2 + 1] = v0 + t * (0.98 - v0);
                    colors.set(col, vi * 3);
                    joints.set(s.joints, vi * 4); weights.set(s.weights, vi * 4);
                    vi++;
                }
            }
            for (let k = 0; k < SEG; k++) {
                const q = base + k * 2;
                index[ii++] = q; index[ii++] = q + 2; index[ii++] = q + 1; index[ii++] = q + 1; index[ii++] = q + 2; index[ii++] = q + 3;
            }
        }
        return { positions, normals, uvs, colors, joints, weights, index };
    }

    // ── coat ───────────────────────────────────────────────────────────────
    const LEG_TAGS = new Set(['upperleg', 'thigh', 'lowerleg', 'pastern', 'paw', 'pad', 'toe', 'hoof']);
    const LOW_LEG_TAGS = new Set(['lowerleg', 'pastern', 'paw', 'pad', 'toe', 'hoof']);
    /** Who has whiskers, and how: rows and columns on each pad, their spacing (skull radii), length, thickness, spread. */
    const WHISKERS = {
        cat: { rows: 4, cols: 4, dy: 0.05, dz: 0.035, len: 1.05, thick: 1, up: 0.34, fan: 0.36 },
        lion: { rows: 4, cols: 5, dy: 0.05, dz: 0.034, len: 0.95, thick: 1.25, up: 0.3, fan: 0.4 },
        tiger: { rows: 4, cols: 5, dy: 0.05, dz: 0.034, len: 1.05, thick: 1.25, up: 0.3, fan: 0.4 },
        dog: { rows: 3, cols: 3, dy: 0.06, dz: 0.05, len: 0.55, thick: 0.9, up: 0.28, fan: 0.3 },
        wolf: { rows: 3, cols: 3, dy: 0.06, dz: 0.05, len: 0.6, thick: 0.9, up: 0.28, fan: 0.3 },
        fox: { rows: 3, cols: 4, dy: 0.055, dz: 0.04, len: 0.8, thick: 0.85, up: 0.3, fan: 0.34 },
        rabbit: { rows: 3, cols: 4, dy: 0.06, dz: 0.04, len: 1.0, thick: 0.8, up: 0.32, fan: 0.36 }
    };
    const HEAD_TAGS = new Set(['skull', 'brow', 'snout', 'whisker', 'nosepad', 'jaw', 'chin', 'cheek', 'ear']);
    const TORSO_TAGS = new Set(['torso', 'belly', 'rump', 'back', 'hump', 'neck', 'mane', 'scapula']);

    /**
     * How pale an animal's own face markings make a point of its head and throat (0 to 1, toward the light
     * fur): a deer's white chin, the band behind its nose, its throat patch and eye rings; a bear's pale
     * muzzle tip; a rabbit's pale eye rings, muzzle and chin; a sheep's face is its own color (none here);
     * a reptile's pale lips and throat.
     */
    function faceMarks(r, lay, p, n, tag, hx, hy, hz, under) {
        const { J, sr } = lay, { z0, zt } = J.mouth, face = profileOf(r).face;
        const onHead = HEAD_TAGS.has(tag);
        const ring = () => { let v = 0; for (const e of lay.eyes) { const d = len(sub(p, e.center)) / e.R; v = Math.max(v, smooth(1.2, 1.35, d) * smooth(1.75, 1.45, d)); } return v; };
        if (face === 'deer') {
            const chin = onHead ? smooth(-0.32, -0.45, hy) * smooth(zt - 0.75, zt - 0.5, hz) : 0;
            const band = onHead ? smooth(zt - 0.62, zt - 0.5, hz) * smooth(zt - 0.22, zt - 0.32, hz) * smooth(0.15, -0.05, hy) : 0;
            // The throat patch: a bright white bib high under the throat, behind the jaw.
            const tp = add(J.atlas, add(mul(J.hup, -0.85 * sr), mul(J.hdir, -0.3 * sr)));
            const patch = (tag === 'neck' || tag === 'jaw') ? smooth(0.55 * sr, 0.3 * sr, len(sub(p, tp))) * smooth(0, 0.4, under + 0.2) : 0;
            return clamp(chin + band + patch + (onHead ? ring() * 0.7 : 0), 0, 1);
        }
        if (face === 'bear') return onHead ? smooth(zt - 0.75, zt - 0.4, hz) * smooth(0.25, 0.0, hy) * 0.55 : 0;
        if (face === 'rabbit') {
            const muzzle = onHead ? smooth(-0.22, -0.36, hy) * smooth(zt - 0.45, zt - 0.3, hz) * 0.55 : 0;
            return clamp(muzzle + (tag === 'chin' ? 0.8 : 0) + (onHead ? ring() * 0.8 : 0) + ((tag === 'neck' || tag === 'jaw') ? smooth(0.3, 0.8, under) * 0.8 : 0), 0, 1);
        }
        if (face === 'reptile') return onHead ? smooth(-0.3, -0.45, hy) * smooth(z0, z0 + 0.3, hz) + ((tag === 'neck' || tag === 'jaw') ? smooth(0.2, 0.8, under) : 0) : smooth(0.2, 0.8, under) * (tag === 'neck' ? 1 : 0);
        return (tag === 'neck' || tag === 'jaw') ? smooth(0.2, 0.8, under) * 0.9 : 0;
    }

    /**
     * A tiger's stripes (after photos of Bengal and Amur tigers): narrow dark stripes, each its own irregular
     * line, running down from the spine and slanting back, tapering to a point before the white belly (never
     * meeting underneath), many doubled or forked low on the flank; on the neck the same down the sides; on the
     * legs short horizontal bars on the outside, fading inside. Each stripe is placed by a seeded walk along
     * the body, not a repeating wave. Returns 0..1.
     */
    function tigerStripe(r, lay, p, n, tag, torsoMid, onLeg, onHead, hz, hy) {
        const { J, g } = lay, seed = (r.seed % 1000) + 17, ps = r.patternScale || 1, side = p[0] >= 0 ? 1 : -1;
        const rnd = (i, k) => hash3(i * 1.37 + k * 7.1, side * 3.3 + k, k * 1.9, seed);
        // A line of half-width w at distance d (none where it has tapered away).
        const line = (w, d) => w > 1e-3 ? smooth(w, w * 0.5, d) : 0;
        if (onHead || tag === 'tail') return 0;
        if (onLeg) {
            // Bars across the leg, outside only, uneven in spacing and length, broken at the front and back.
            const out = clamp((n[0] * side + 0.25) / 0.6, 0, 1), y = p[1] / g * 15 / ps, i = Math.floor(y), f = y - i;
            const w = 0.14 + 0.14 * rnd(i, 3), c = 0.5 + 0.3 * (rnd(i, 4) - 0.5) + 0.12 * fbm(p[0] * 30, p[2] * 30, i, seed, 2);
            const reach = smooth(0.15, 0.45, Math.abs(Math.atan2(n[2], n[0] * side)) < 1.2 + 0.6 * rnd(i, 5) ? 1 : 0);
            return line(w, Math.abs(f - c)) * out * reach * (rnd(i, 6) > 0.18 ? 1 : 0);
        }
        // Up the side: 1 on the spine, 0 under the belly (the angle round the torso's middle line).
        const h = 1 - Math.abs(Math.atan2(Math.abs(p[0]), p[1] - torsoMid[1])) / Math.PI;
        // Along the body in stripe units: stripes about every 0.075 g, a seeded spacing, slanting back lower down.
        const neck = tag === 'neck' ? 1 : 0, zz = (p[2] + (1 - h) * 0.07 * g * (1 - neck)) / g / (0.075 * ps);
        const base = Math.floor(zz);
        let best = 0;
        for (let i = base - 2; i <= base + 2; i++) {
            const c = i + 0.5 + 0.35 * (rnd(i, 1) - 0.5) + 0.25 * fbm(h * 3 + i, i * 0.7, side, seed + 3, 2);
            // Where it ends low on the flank (a point), how wide it starts, doubled or forked.
            const end = 0.2 + 0.32 * rnd(i, 2), top = rnd(i, 7) < 0.25 ? 0.88 + 0.1 * rnd(i, 8) : 1.05, wide = 0.11 + 0.1 * rnd(i, 9);
            const taper = smooth(end, end + 0.28, h) * (1 - smooth(top - 0.06, top, h));
            const d = Math.abs(zz - c), wv = wide * taper;
            let v = line(wv, d);
            const kind = rnd(i, 10);
            if (kind < 0.3) v = Math.max(v, line(wv * 0.6, Math.abs(zz - c - 0.3)) * smooth(end + 0.08, end + 0.3, h) * (1 - smooth(0.75, 0.85, h)));
            else if (kind < 0.55) { const split = 0.55 + 0.15 * rnd(i, 11), sp = smooth(split, end, h) * 0.22;
                v = Math.max(v * smooth(split - 0.12, split, h), line(wv * 0.6, Math.abs(zz - c - sp)), line(wv * 0.6, Math.abs(zz - c + sp))); }
            best = Math.max(best, v);
        }
        return best;
    }

    /**
     * The coat color at a body point: the pattern, the light underside and
     * muzzle, the dark nose pad, lips and eye rims, the pads under the paws,
     * and the bare skin of the genitalia and teats. `tag` is the nearest
     * shape's.
     */
    function coatColor(r, lay, p, n, tag, C) {
        const { J, g, sr } = lay;
        const seed = r.seed % 1000;
        const ps = r.patternScale, amt = r.patternAmount;
        let col = C.coat;
        // Where the torso's middle line runs at this point.
        const torsoMid = lerp([0, J.hip[1] + 0.15 * g, J.hip[2]], [0, J.shoulder[1] + 0.15 * g, J.shoulder[2]], clamp((p[2] - J.hip[2]) / (J.shoulder[2] - J.hip[2]), 0, 1));
        const under = clamp(-n[1], 0, 1);
        const onLeg = LEG_TAGS.has(tag), lowLeg = LOW_LEG_TAGS.has(tag), onHead = HEAD_TAGS.has(tag);
        // The head's own frame: x across, y up, z forward, in skull radii.
        const rel = sub(p, J.skull), hx = Math.abs(rel[0]) / sr, hy = dot(rel, J.hup) / sr, hz = dot(rel, J.hdir) / sr;
        const { z0, zt } = J.mouth;
        const belly = smooth(0.15, 0.75, under) * (p[1] < torsoMid[1] ? 1 : 0.3);
        // Inside the legs, toward the body's middle.
        const inner = onLeg ? smooth(0.1, 0.7, -n[0] * Math.sign(p[0] || 1)) : 0;
        // The pale muzzle a crisp marking: the upper lips over the whisker beds and the chin.
        // (A canid's anatomical muzzle stands higher on its face: its pale lips reach further up, a fox's up to the cheeks.)
        const mTop = -0.2 + (profileOf(r).felid ? 0.16 * smooth(0.26, 0.1, hx) * smooth(zt - 0.45, zt - 0.25, hz) : 0) + (r.kind === 'fox' ? 0.14 : r.kind === 'wolf' || r.kind === 'dog' ? 0.07 : 0);
        const muzzle = onHead ? smooth(mTop, mTop - 0.1, hy) * smooth(z0, z0 + 0.25, hz) + (tag === 'chin' ? 1 : 0) + (tag === 'whisker' ? 0.85 * smooth(-0.05, -0.2, hy) : 0) : 0;
        const throat = tag === 'neck' || tag === 'jaw' ? smooth(0.2, 0.8, under) : 0;
        const pat = r.pattern;
        const k = x => x * amt;
        const faceKind = profileOf(r).face;
        if (pat === 'countershade' || pat === 'points' || pat === 'tabby' || pat === 'saddle' || pat === 'stripes' || pat === 'spots' || pat === 'rosettes' || pat === 'scales') {
            const pale = faceKind ? faceMarks(r, lay, p, n, tag, hx, hy, hz, under) : muzzle * 0.85 + throat * 0.9;
            col = mixRgb(col, C.light, k(clamp(belly + inner * 0.35 + pale, 0, 1)));
        } else if (faceKind === 'bear') col = mixRgb(col, C.light, k(faceMarks(r, lay, p, n, tag, hx, hy, hz, under)));
        if (pat === 'spots' || pat === 'dapple') {
            const [d1] = worley(p[0] * 9 / ps, p[1] * 9 / ps, p[2] * 9 / ps, seed);
            const spot = 1 - smooth(0.22, 0.32, d1);
            col = mixRgb(col, pat === 'dapple' ? C.light : C.marking, k(spot * (pat === 'dapple' ? 0.7 : 1) * (1 - belly * 0.8)));
        } else if (pat === 'rosettes') {
            const [d1, d2] = worley(p[0] * 8 / ps, p[1] * 8 / ps, p[2] * 8 / ps, seed);
            const ring = smooth(0.06, 0.12, d2 - d1) * (1 - smooth(0.12, 0.2, d2 - d1));
            const dotSpot = (1 - smooth(0.12, 0.2, d1)) * (lowLeg || onHead ? 1 : 0);
            col = mixRgb(col, C.marking, k(clamp(ring * (1 - (lowLeg || onHead ? 1 : 0)) + dotSpot, 0, 1) * (1 - belly * 0.7)));
        } else if (pat === 'stripes' && r.kind === 'tiger') {
            col = mixRgb(col, C.marking, k(tigerStripe(r, lay, p, n, tag, torsoMid, onLeg, onHead, hz, hy) * (1 - belly * 0.92) * (1 - muzzle)));
        } else if (pat === 'stripes' || pat === 'tabby') {
            const warp = fbm(p[0] * 4, p[1] * 4, p[2] * 4, seed, 3) * 0.35;
            // Upright bands down the trunk and the haunches, rings round the legs below the elbow and stifle.
            const knee = p[2] > 0 ? J.frontKnee[1] : J.rearKnee[1];
            const ring = onLeg ? 1 - smooth(knee, knee + 0.12 * g, p[1]) : 0;
            const along = tag === 'neck' || onHead ? p[2] * 0.8 + p[1] * 0.6 : p[2] + (p[1] * 1.3 - p[2]) * ring;
            // Stripes slant back as they run down from the spine, waver, and taper (often forking) toward the belly.
            const height = clamp((p[1] - torsoMid[1] + 0.25 * g) / (0.5 * g), 0, 1), slant = pat === 'stripes' && !onLeg && !onHead ? (1 - height) * 0.10 * g : 0;
            const phase = (along + slant) * 22 / ps + warp * (pat === 'tabby' ? 2.5 : 4.5) + (pat === 'stripes' ? 0.35 * fbm(p[0] * 9, p[1] * 9, p[2] * 2, seed + 7, 2) : 0);
            const s = Math.sin(phase * Math.PI);
            // The face's front stays clear: marks on the forehead and behind the eyes only.
            const face = onHead ? smooth(-0.35, 0.05, hz) * smooth(0.5, 0.28, hy) : 0;
            const low = pat === 'stripes' && !onLeg && !onHead ? 1 - height : 0;
            // A mackerel tabby's stripes are narrow, over an agouti ground, with a dark line down the spine.
            const th = pat === 'tabby' ? 0.58 : 0.50 + 0.38 * low;
            const fork = pat === 'stripes' ? smooth(0.45, 0.9, low) * smooth(0.82, 0.95, Math.sin(phase * Math.PI * 2 + 1.1)) * 0.85 : 0;
            const spine = pat === 'tabby' && !onLeg && !onHead && TORSO_TAGS.has(tag) ? smooth(0.72, 0.95, n[1]) : 0;
            const stripe = Math.max(smooth(th, th + (pat === 'tabby' ? 0.22 : 0.18), s), fork, spine) * (1 - belly) * (1 - muzzle) * (1 - face);
            col = mixRgb(col, C.marking, k(stripe * (pat === 'tabby' ? 0.75 : 1)));
        } else if (pat === 'socks' || pat === 'points') {
            const sockTop = J.frontKnee[1] * (pat === 'socks' ? 0.75 : 1);
            const sock = lowLeg ? smooth(sockTop + 0.04, sockTop - 0.04, p[1]) : 0;
            // A sheep's face and legs are bare of wool and all one color, the wool ending in a clean line.
            const bareFace = faceKind === 'sheep' && (onHead || tag === 'ear') ? smooth(-0.2, -0.32, -hz) * (tag === 'ear' ? 1 : 1) : 0;
            const catMask=r.kind==='cat'&&onHead?smooth(-.45,.55,hz)*(1-smooth(.55,1.1,hy)):0;
            const point = pat === 'points' ? clamp((tag === 'ear' || tag==='tail'&&r.kind==='cat' ? 1 : 0) + (faceKind === 'sheep' ? bareFace : tag === 'snout' || tag === 'jaw' ? (profileOf(r).lightFace ? 0 : 0.5) : 0) + sock+catMask, 0, 1) : sock;
            col = mixRgb(col, C.marking, k(point));
            if(r.kind==='cat'&&r.catType==='ragdoll'){
                const blaze=onHead?(1-smooth(.11+.30*clamp(.60-hy,0,1),.16+.30*clamp(.60-hy,0,1),hx))*smooth(.34,.56,hz):0;
                const mitt=onLeg?smooth(.15*g,.09*g,p[1]):0;
                col=mixRgb(col,C.light,Math.max(blaze,mitt,tag==='mane'?1:0));
            }
            if (pat === 'socks') {
                // A blaze down the face.
                const blaze = onHead ? smooth(0.2, 0.15, hx) * smooth(-0.15, -0.05, hy) * smooth(0.0, 0.15, hz) : 0;
                col = mixRgb(col, C.marking, k(blaze));
            }
        } else if (pat === 'piebald') {
            const v = fbm(p[0] * 2.4 / ps, p[1] * 2.4 / ps, p[2] * 2.4 / ps, seed, 3);
            let white = smooth(0.0, 0.08, v);
            if (faceKind === 'cattle') {
                // A cow's patches lie on the neck, back and flanks: the face is white but for patches round the
                // eyes and ears, and the belly, the lower legs and the tail's switch are white.
                const eyes = onHead ? Math.max(...lay.eyes.map(e => smooth(3.2, 2.2, len(sub(p, e.center)) / e.R))) * smooth(0.45, 0.6, hx) : 0;
                if (onHead || tag === 'ear') white = tag === 'ear' || hz < -0.55 ? Math.min(white, 0.3) : 1 - eyes;
                if (lowLeg) white = Math.max(white, smooth(J.frontKnee[1] * 1.1, J.frontKnee[1] * 0.9, p[1]));
                white = Math.max(white, belly);
            }
            col = mixRgb(col, C.marking, k(white));
        } else if (pat === 'scales') {
            // Each scale a cell: darker in the seams between, lit a little toward its middle, each its own shade.
            const f = (onHead ? 48 : 36) / ps, x = p[0] * f, y = p[1] * f, z = p[2] * f;
            const [d1, d2] = worley(x, y, z, seed);
            const edge = 1 - smooth(0.02, 0.16, d2 - d1);
            const tone = hash3(Math.floor(x + 0.5), Math.floor(y + 0.5), Math.floor(z + 0.5), seed + 9) - 0.5;
            col = mixRgb(col, tone > 0 ? C.light : C.marking, k(Math.abs(tone) * 0.25 * (1 - belly)));
            col = mixRgb(col, C.marking, k(edge * 0.30 * (1 - belly * 0.5)));
            // Darker along the back.
            col = mixRgb(col, C.marking, k(smooth(0.1, 0.9, n[1]) * 0.35));
        }
        if (pat === 'saddle') {
            const saddle = TORSO_TAGS.has(tag) ? smooth(-0.1, 0.5, n[1]) * smooth(torsoMid[1] - 0.05, torsoMid[1] + 0.08, p[1]) : 0;
            col = mixRgb(col, C.marking, k(saddle));
        }
        if (tag === 'mane') {
            // A mane is fair at its fringe round the face and darker behind.
            const fringe = r.mane === 'lion' ? smooth(-0.9, 0.1, hz) * (onHead || hz > -2.2 ? 1 : 0) : 0;
            col = mixRgb(C.mane, mixRgb(C.mane, C.light, 0.55), fringe * 0.6);
        }
        if (onHead && r.feet !== 'hoof') {
            // Lips: a dark edge where the upper lip meets the chin at the front, lost under the whisker beds behind.
            const lipY = r.kind==='cat'?-.29:-0.4 - 0.05 * clamp((hz - z0) / (zt - z0), 0, 1);
            const lip = smooth(0.045, 0.012, Math.abs(hy - lipY)) * smooth(zt - 0.6, zt - 0.38, hz) * smooth(zt + 0.05, zt - 0.2, hz);
            col = mixRgb(col, mixRgb(C.nose, C.marking, 0.6), lip * 0.55);
            // A reptile's teeth: a row of small pale points along the upper lip's edge.
            if (faceKind === 'reptile' && hz > z0 && hz < zt - 0.05 && hx > 0.12) {
                const t = (hz - z0) / 0.11, f = t - Math.floor(t), tip = lipY - 0.07 * (1 - Math.abs(f * 2 - 1));
                if (hy < lipY + 0.015 && hy > tip) col = mixRgb(col, [0.88, 0.85, 0.74], 0.9);
            }
        }
        // The lids' rims dark bare skin, a pale patch under each eye of a cat's face.
        for (const eye of lay.eyes) {
            const d = len(sub(p, eye.center)) / eye.R;
            // The rim follows the lids' almond: across the opening's own axes, near its edge.
            const L = eye.lids, q = sub(p, L.c), u = dot(q, L.ax) / L.r[0], v = dot(q, L.ay) / L.r[1];
            const edge = Math.sqrt(u * u + v * v);
            if (d < 2) col = mixRgb(col, mixRgb(C.nose, [0.05, 0.04, 0.04], 0.55), smooth(r.kind==='cat'?1.13:1.45, 1.01, edge) * smooth(1.9, 1.3, d) * (r.kind==='cat'?.48:.9));
            else if (d < 2.4 && profileOf(r).felid && r.pattern !== 'solid') col = mixRgb(col, C.light, smooth(2.4, 1.7, d) * smooth(0.2, -0.4, dot(sub(p, eye.center), J.hup) / eye.R) * 0.5 * amt);
            // A cat's dark tear line from the inner corner of the eye down beside the nose.
            if (profileOf(r).felid && onHead && r.pattern !== 'solid') {
                // Along a line laid on the skin (eye.tear) from the corner down.
                let off = Infinity, at = 0;
                const T = eye.tear || [];
                for (let i = 0; i + 1 < T.length; i++) {
                    const ab = sub(T[i + 1], T[i]), t = clamp(dot(sub(p, T[i]), ab) / dot(ab, ab), 0, 1), d = len(sub(p, add(T[i], mul(ab, t))));
                    if (d < off) { off = d; at = (i + t) / (T.length - 1); }
                }
                // A big cat's tear mark is a soft, short smudge; a small cat's a fine line.
                const big = profileOf(r).bigcat ? 1 : 0;
                col = mixRgb(col, mixRgb(C.marking, C.nose, 0.35), smooth((0.03 + 0.02 * big) * sr, 0.01 * sr, off) * (1 - at * (0.55 + 0.4 * big)) * (0.8 - 0.45 * big) * amt);
            }
        }
        // A tiger's face: white spots over the eyes, white cheeks and muzzle sides crossed by a few black bars, and fine
        // black lines over the forehead running up and out from between the eyes.
        if (r.kind === 'tiger' && onHead && pat === 'stripes') {
            for (const e of lay.eyes) {
                const q = sub(p, e.center), up = dot(q, J.hup) / e.R, ac = Math.abs(q[0]) / e.R, fw = dot(q, J.hdir) / e.R;
                col = mixRgb(col, C.light, amt * (1 - smooth(0.75, 1.1, Math.hypot((up - 1.9) / 1.0, (fw + 0.3) / 1.3, (ac - 0.1) / 1.2))));
            }
            const cheek = smooth(0.35, 0.55, hx) * smooth(0.1, -0.15, hy) * smooth(-0.9, -0.4, hz);
            col = mixRgb(col, C.light, amt * cheek * 0.9);
            const bars = smooth(0.82, 0.95, Math.sin((hy * 7 - hz * 2.2 + hx * 1.5) * Math.PI)) * cheek * smooth(-0.85, -0.2, hz);
            const brow = smooth(0.35, 0.5, hy) * smooth(0.85, 0.95, Math.sin((hx * 5.5 + hy * 2.5 - hz * 1.2) * Math.PI)) * smooth(-0.6, 0.0, hz) * (1 - smooth(0.7, 0.95, hx));
            col = mixRgb(col, C.marking, amt * Math.max(bars, brow * 0.9));
        }
        if (r.kind === 'cat' && onHead && (pat === 'tabby' || pat === 'stripes') && hy > 0.12) {
            const clean = mixRgb(C.coat, C.light, clamp(muzzle * 0.85, 0, 1));
            const line = Math.exp(-(((hx - (0.16 + 0.13 * (0.8 - hy))) / 0.035) ** 2))
                + Math.exp(-(((hx - 0.42) / 0.045) ** 2));
            const forehead = smooth(0.3, 0.48, hy) * (1 - smooth(0.78, 0.95, hy)) * smooth(0.25, 0.5, hz);
            col = mixRgb(clean, C.marking, Math.min(0.7, line * forehead * amt));
        }
        if (tag === 'nosepad') {
            if (r.kind === 'cat') {
                col = C.nose;
            } else col = C.nose;
        }
        // A black bird's plumage: a blue-violet sheen where the feathers face the light, so its form reads.
        if (faceKind === 'bird' && pat === 'solid') col = mixRgb(col, C.marking, smooth(-0.1, 0.8, n[1] * 0.6 + n[2] * 0.3 + Math.abs(n[0]) * 0.2) * 0.4);
        if (faceKind === 'bird' && onHead) {
            // The bare ring round a bird's eye, the cere's color.
            for (const e of lay.eyes) { const d = len(sub(p, e.center)) / e.R; col = mixRgb(col, C.nose, smooth(1.42, 1.25, d) * smooth(0.95, 1.1, d)); }
        }
        // A bull's curly poll: the curls between the horns, each lit on its crown and dark between.
        if (faceKind === 'cattle' && onHead && hy > 0.5 && hz < 0.25) {
            const f = 9 / sr, [d1, d2] = worley(p[0] * f, p[1] * f, p[2] * f, 13);
            col = mul(col, 0.86 + 0.14 * smooth(0.0, 0.3, d2 - d1) * smooth(0.5, 0.65, hy));
        }
        // A cow's wide bare muzzle plate, wet and a little darker at its edge.
        if (faceKind === 'cattle' && onHead) col = mixRgb(col, mixRgb(C.nose, [0.25, 0.15, 0.15], smooth(0.2, 0.45, hx) * 0.4), smooth(zt - 0.32, zt - 0.2, hz) * smooth(-0.42, -0.3, hy));
        // A deer's bare nose: the whole tip of the muzzle above the lip, dark.
        if (faceKind === 'deer' && onHead) col = mixRgb(col, C.nose, smooth(zt - 0.3, zt - 0.2, hz) * smooth(-0.3, -0.2, hy));
        // A cat's whisker spots: the dark roots of the whiskers in rows across each pad.
        if (profileOf(r).felid && tag === 'whisker' && lay.whiskerPad && Math.abs(n[0]) > 0.25) {
            const wp = lay.whiskerPad, row = (hy - wp.y + 0.14) / 0.085, col2 = (hz - wp.z + 0.2) / 0.1;
            const ri = Math.round(row), ci = Math.round(col2 - 0.5 * (ri % 2));
            if (ri >= 0 && ri <= 3 && ci >= 0 && ci <= 3 - Math.floor(ri / 2) && hx > 0.18) {
                const j = hash3(ri, ci, p[0] > 0 ? 1 : 2, 31) - 0.5;
                const d = Math.hypot(row - ri - j * 0.3, (col2 - 0.5 * (ri % 2) - ci - j * 0.4) * 0.85);
                col = mixRgb(col, mixRgb(C.marking, C.nose, 0.4), smooth(0.22, 0.12, d) * 0.75 * amt);
            }
        }
        // The philtrum's groove a shade of the nose's skin.
        if (onHead && lay.philtrum) {
            const [a, b] = lay.philtrum, ab = sub(b, a), t = clamp(dot(sub(p, a), ab) / dot(ab, ab), 0, 1);
            col = mixRgb(col, mixRgb(C.nose, col, 0.5), smooth(0.05 * sr, 0.02 * sr, len(sub(p, add(a, mul(ab, t))))) * 0.45 * smooth(0.7, 0.3, t));
        }
        // Inside each nostril: dark, shading off at its rim.
        if (onHead) for (const no of lay.nostrils) {
            const d = shapeDistance(no.shape, p);
            if (d < no.R * 0.6) col = mixRgb(col, mul(C.nose, 0.35), smooth(no.R * 0.6, no.R * 0.1, d) * 0.9);
        }
        if (r.feet === 'hoof' && lowLeg && lay.hoofTopF) {
            const top = p[2] > (J.frontToe[2] + J.rearToe[2]) / 2 ? lay.hoofTopF : lay.hoofTopR;
            const wall = smooth(top + 0.004 * g, top - 0.004 * g, p[1] - 0.12 * top * Math.max(0, -n[2]));
            if (wall > 0 && tag !== 'hoof') col = mixRgb(col, C.hoof, wall);
            else if (tag === 'hoof' && wall < 1 && p[1] < top * 1.6) col = mixRgb(col, C.hoof, wall), tag = 'pastern';
        }
        if (tag === 'hoof') {
            // The hoof wall: fine vertical horn tubules, faint growth rings, worn paler toward the ground;
            // underneath, the sole paler still with the darker frog's V (a whole hoof).
            const tubules = valueNoise(p[0] * 420 / g, p[1] * 18 / g, p[2] * 420 / g, seed + 29), rings = Math.sin(p[1] / g * 260 + 2 * valueNoise(p[0] * 60, p[1] * 60, p[2] * 60, 3));
            col = mixRgb(mul(C.hoof, 0.9 + 0.22 * tubules + 0.04 * rings), [0.42, 0.38, 0.33], 0.25 * smooth(0.025 * g, 0.0, p[1]));
            if (n[1] < -0.6) {
                col = mixRgb(C.hoof, [0.55, 0.5, 0.45], 0.45);
                if (!profileOf(r).cloven) {
                    const toe = p[2] > 0 ? J.frontToe : J.rearToe, hr = 0.05 * r.pawSize, dx = Math.abs(Math.abs(p[0]) - toe[0]), dz = p[2] - (toe[2] + 0.6 * hr);
                    const along = clamp((dz + 0.85 * hr) / (1.1 * hr), 0, 1), half = 0.32 * hr * (1 - along);
                    col = mixRgb(col, [0.32, 0.27, 0.24], (along > 0 && along < 1 ? 1 : 0) * smooth(half + 0.04 * hr, half, dx) * 0.8);
                }
            }
        }
        // Pads under the paws, dark and bare.
        // Pads under the paws: the bare, leathery metacarpal pad and toe beans; fur (a shade darker) between them.
        // Laid out on the sole as the foot is built (its toes' arc and the pad behind them), so they stay crisp at any mesh size.
        if ((tag === 'pad' || tag === 'toe' || tag === 'paw') && r.feet !== 'hoof' && p[1] < 0.07 * g && n[1] < -0.15) {
            const front = Math.abs(p[2] - J.frontToe[2]) < Math.abs(p[2] - J.rearToe[2]), toe = front ? J.frontToe : J.rearToe, plant = r.plantigrade;
            const pr = 0.072 * r.pawSize * (front ? 1 : 0.92 * 0.92) * (0.6 + 0.4 * g) * (front && profileOf(r).bigcat ? 1.12 : 1);
            const dx = Math.abs(p[0]) - toe[0], dz = p[2] - toe[2], claw = r.feet === 'claw';
            const blob = (cx, cz, rx, rz) => 1 - smooth(0.8, 1.0, Math.hypot((dx - cx) / rx, (dz - cz) / rz));
            // The metacarpal (or a bear's long plantar) pad, wider in front, three-lobed behind.
            let bare = blob(0, -0.33 * pr - 0.75 * plant * pr, 0.46 * pr, (0.30 + 0.55 * plant) * pr);
            bare = Math.max(bare, blob(0, -0.42 * pr - 0.95 * plant * pr, 0.28 * pr, (0.22 + 0.45 * plant) * pr));
            for (const deg of [-50, -17, 17, 50]) {
                const a = deg * DEG, reach = Math.abs(deg) === 17 ? 1 : 0.86;
                bare = Math.max(bare, blob(Math.sin(a) * 0.6 * pr, (Math.cos(a) * 0.5 + 0.25) * pr * reach + (claw ? 0.1 * pr : 0), 0.15 * pr, 0.18 * pr));
            }
            const leather = mixRgb(C.nose, [0.08, 0.06, 0.06], 0.6);
            col = mixRgb(mul(col, 1 - 0.2 * smooth(-0.2, -0.7, n[1])), mul(leather, 0.9 + 0.2 * valueNoise(p[0] * 900, p[1] * 900, p[2] * 900, 5)), bare * smooth(-0.2, -0.5, n[1]));
        }
        if (tag === 'scrotum') col = mixRgb(col, mixRgb(C.nose, C.coat, 0.5), 0.35);
        if (tag === 'sheath') {
            const tipD = lay.sheathTip ? len(sub(p, lay.sheathTip)) : 1;
            col = mixRgb(col, mixRgb(C.nose, [0.75, 0.5, 0.5], 0.4), smooth(0.04 * g, 0.015 * g, tipD));
        }
        if (tag === 'vulva') col = mixRgb(C.nose, [0.55, 0.32, 0.32], 0.35);
        if (tag === 'udder') col = mixRgb(col, mixRgb(C.light, [0.85, 0.65, 0.6], 0.5), 0.6);
        if (lay.anus) {
            const d = len(sub(p, lay.anus));
            if (d < 0.03 * g) col = mixRgb(col, mixRgb(C.nose, [0.1, 0.07, 0.07], 0.5), smooth(0.03 * g, 0.012 * g, d));
        }
        // Wild-type coats are agouti: banded guard hairs give a grizzled back (a wolf's dark-tipped, a grizzly's silver-tipped)
        // with paler bands showing through on the flanks.
        const wild = ({ wolf: 1, bear: 0.7, rabbit: 0.8, boar: 0.5, fox: 0.25 }[r.kind] || 0) + (r.pattern === 'tabby' ? 0.45 : 0);
        if (wild && !(tag === 'nosepad' || tag === 'hoof' || tag === 'pad' || tag === 'toe')) {
            const fine = valueNoise(p[0] * 90 / g, p[1] * 90 / g, p[2] * 90 / g, seed + 17), patch = fbm(p[0] * 7 / g, p[1] * 7 / g, p[2] * 7 / g, seed + 19, 2);
            const top = smooth(-0.1, 0.6, n[1]) * (1 - belly) * (onHead ? 0.5 : 1), tipTone = r.kind === 'bear' ? mixRgb(C.light, C.coat, 0.2) : C.marking;
            col = mixRgb(col, tipTone, wild * top * (0.3 + 0.3 * patch) * smooth(0.45, 0.8, fine));
            col = mixRgb(col, mixRgb(C.light, C.coat, 0.35), wild * 0.3 * (1 - top) * smooth(0.55, 0.85, 1 - fine) * (1 - belly * 0.5));
        }
        // A wolf's face: pale cheeks and muzzle sides under a darker bridge and brow.
        if (r.kind === 'wolf' && onHead) {
            const bridge = smooth(0.12, 0.35, hy) * (1 - smooth(0.10, 0.28, hx)) * smooth(z0 - 0.2, zt - 0.4, hz);
            col = mixRgb(col, mixRgb(C.coat, C.marking, 0.5), bridge * 0.55 * amt);
        }
        // A little mottling so a solid coat is not flat paint, a touch darker along the back and paler under.
        const mottle = (1 + 0.06 * fbm(p[0] * 20, p[1] * 20, p[2] * 20, seed + 5, 2)) * (1 - 0.08 * smooth(0.2, 0.9, n[1]) + 0.06 * under);
        return [col[0] * mottle, col[1] * mottle, col[2] * mottle];
    }

    // ── assembly ───────────────────────────────────────────────────────────
    /**
     * The grain of a furred coat at a point, as a brightness factor about 1: fine streaks along the hair's
     * flow (back along the body, down the legs, back from the face), or a fleece's crimp: each lock lit on
     * its crown and dark in the crevices between.
     */
    function coatGrain(r, lay, p, n, tag) {
        const g = lay.g;
        if (profileOf(r).face === 'sheep' && !HEAD_TAGS.has(tag) && !LOW_LEG_TAGS.has(tag)) {
            // Locks shaded darker toward their roots between them, each crimped in fine waves.
            const f = 30 / g, [d1, d2] = worley(p[0] * f, p[1] * f, p[2] * f, 41);
            const crimp = valueNoise(p[0] * 160 / g, p[1] * 160 / g, p[2] * 160 / g, 5);
            return 0.93 + 0.07 * smooth(0.0, 0.35, d2 - d1) * (1 - 0.6 * d1) + 0.05 * crimp;
        }
        const flow = norm(LEG_TAGS.has(tag) ? [0, -1, -0.15] : HEAD_TAGS.has(tag) ? mul(lay.J.hdir, -1) : [0, -0.45, -1]);
        const f = norm(sub(flow, mul(n, dot(flow, n)))), side = norm(cross(n, f));
        if (profileOf(r).face === 'bird') {
            // Feathers overlapping in rows along the flow, each a rounded vane with a dark edge at its tip, smaller on the head.
            const fs = (HEAD_TAGS.has(tag) ? 0.12 * lay.J.skullR : 0.045 * g);
            const a = dot(p, f) / fs, row = Math.floor(a), b = dot(p, side) / fs + 0.5 * (row & 1);
            const u = b - Math.floor(b) - 0.5, v = a - row, edge = 0.85 - 1.6 * u * u;
            return (0.82 + 0.18 * smooth(0.0, 0.14, Math.abs(v - edge))) * (0.9 + 0.14 * v) * (1 + 0.05 * valueNoise(p[0] * 300, p[1] * 300, p[2] * 300, 3));
        }
        const a = dot(p, f) / g * 14, b = dot(p, side) / g * 260;
        const streak = valueNoise(b, a, dot(p, n) / g * 30, 77) * 0.6 + valueNoise(b * 2.3, a * 1.7, 0, 78) * 0.4;
        // Even a sleek coat (a horse's, a bull's) shows its hair lie: fine streaks along the flow.
        return 1 + 0.16 * streak * Math.max(0.35, Math.min(1, r.fluff * 1.5));
    }
    const FINE_PATTERNS = new Set(['stripes', 'tabby', 'spots', 'rosettes', 'dapple', 'piebald', 'scales']);
    /**
     * The coat painted into a picture for a fine pattern (stripes and spots finer than the saved mesh's
     * faces): the body's faces are grouped into charts by the axis they face, each chart laid flat along
     * that axis and packed into the picture, every texel painted with the coat at its place on the body,
     * and the charts' edges grown out so filtering never reaches the background. A vertex shared by two
     * charts is split, the copies numbered from `first`. A chart most of whose faces are `fine` (the face,
     * with its lids, lips and nose) gets several times the texels. A strip along the bottom stays white, for the pieces
     * painted by their own colors (`white`, its middle's uv). Returns { uvs, index, extra (each copy's
     * source and uv), white, texture }, or null when the charts do not fit.
     */
    function coatAtlas(positions, index, normals, tags, fine, colorAt, size, first) {
        const n = positions.length / 3, T = index.length / 3;
        const P = v => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
        // Each face's axis: the one its normal leans along most (0..5 for +x, -x, +y, -y, +z, -z).
        const axis = new Uint8Array(T);
        for (let t = 0; t < T; t++) {
            const a = P(index[t * 3]), b = P(index[t * 3 + 1]), c = P(index[t * 3 + 2]);
            const f = cross(sub(b, a), sub(c, a));
            const k = Math.abs(f[0]) >= Math.abs(f[1]) && Math.abs(f[0]) >= Math.abs(f[2]) ? 0 : Math.abs(f[1]) >= Math.abs(f[2]) ? 1 : 2;
            axis[t] = k * 2 + (f[k] < 0 ? 1 : 0);
        }
        // Charts: faces of one axis joined across their edges.
        // Each face edge (slot t * 3 + k) joins the list of slots on the same undirected edge, in slot order.
        const edgeGroup = new Map(), chart = new Int32Array(T).fill(-1);
        const ek = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
        const slotGroup = new Int32Array(T * 3), nextSlot = new Int32Array(T * 3).fill(-1), groupHead = [], groupTail = [];
        for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) {
            const id = ek(index[t * 3 + k], index[t * 3 + (k + 1) % 3]), s = t * 3 + k;
            let g = edgeGroup.get(id);
            if (g === undefined) { g = groupHead.length; edgeGroup.set(id, g); groupHead.push(s); groupTail.push(s); }
            else { nextSlot[groupTail[g]] = s; groupTail[g] = s; }
            slotGroup[s] = g;
        }
        const charts = [];
        for (let t0 = 0; t0 < T; t0++) {
            if (chart[t0] >= 0) continue;
            const id = charts.length, faces = [t0], ax = axis[t0];
            chart[t0] = id;
            for (let q = 0; q < faces.length; q++) {
                const t = faces[q];
                for (let k = 0; k < 3; k++) for (let e = groupHead[slotGroup[t * 3 + k]]; e >= 0; e = nextSlot[e]) {
                    const u = (e / 3) | 0;
                    if (chart[u] < 0 && axis[u] === ax) { chart[u] = id; faces.push(u); }
                }
            }
            let k = 0; for (const t of faces) if (fine[index[t * 3]] && fine[index[t * 3 + 1]] && fine[index[t * 3 + 2]]) k++;
            charts.push({ faces, axis: axis[t0], s: k * 2 > faces.length ? 2.8 : 1 });
        }
        // Each chart flat on its axis's plane, in body units: its corner and extent.
        const flat = (p, ax) => (ax < 2 ? [p[2], p[1]] : ax < 4 ? [p[0], p[2]] : [p[0], p[1]]);
        let area = 0;
        for (const ch of charts) {
            // The chart's plane axes: (z, y) for an x-facing chart, (x, z) for y, (x, y) for z, as `flat`.
            const ua = ch.axis < 2 ? 2 : 0, va = ch.axis < 2 ? 1 : ch.axis < 4 ? 2 : 1;
            let lo0 = Infinity, lo1 = Infinity, hi0 = -Infinity, hi1 = -Infinity;
            for (const t of ch.faces) for (let k = 0; k < 3; k++) {
                const v = index[t * 3 + k] * 3, q0 = positions[v + ua], q1 = positions[v + va];
                lo0 = Math.min(lo0, q0); lo1 = Math.min(lo1, q1); hi0 = Math.max(hi0, q0); hi1 = Math.max(hi1, q1);
            }
            const lo = [lo0, lo1], hi = [hi0, hi1];
            ch.lo = lo; ch.w = (hi[0] - lo[0]) * ch.s; ch.h = (hi[1] - lo[1]) * ch.s;
            area += ch.w * ch.h;
        }
        // Shelf packing at a texel density that fills about two thirds of the picture, smaller until it fits.
        const pad = 3;
        let density = Math.sqrt(size * size * 0.78 / Math.max(area, 1e-6)), placed = false;
        const order = charts.slice().sort((a, b) => b.h - a.h);
        for (let tries = 0; tries < 12 && !placed; tries++) {
            let x = 0, y = 0, rowH = 0;
            placed = true;
            for (const ch of order) {
                const w = Math.ceil(ch.w * density) + pad * 2, h = Math.ceil(ch.h * density) + pad * 2;
                if (x + w > size) { x = 0; y += rowH; rowH = 0; }
                if (w > size || y + h > size - 8) { placed = false; break; }
                ch.ox = x + pad; ch.oy = y + pad;
                x += w; rowH = Math.max(rowH, h);
            }
            if (!placed) density *= 0.94;
        }
        if (!placed) return null;
        // The vertices: one per chart that uses it.
        const uvs = new Float32Array(n * 2), owner = new Int32Array(n).fill(-1), extra = [], out = Array.from(index);
        const copies = new Map();
        const uvOf = (p, ch) => { const q = flat(p, ch.axis); return [(ch.ox + (q[0] - ch.lo[0]) * density * ch.s) / size, (ch.oy + (q[1] - ch.lo[1]) * density * ch.s) / size]; };
        charts.forEach((ch, ci) => {
            for (const t of ch.faces) for (let k = 0; k < 3; k++) {
                const v = index[t * 3 + k];
                if (owner[v] < 0 || owner[v] === ci) { owner[v] = ci; const uv = uvOf(P(v), ch); uvs[v * 2] = uv[0]; uvs[v * 2 + 1] = uv[1]; continue; }
                const key = v * 65536 + ci;
                let id = copies.get(key);
                if (id == null) { id = first + extra.length; copies.set(key, id); extra.push({ from: v, uv: uvOf(P(v), ch) }); }
                out[t * 3 + k] = id;
            }
        });
        // Paint: every texel a face covers (a texel past its edge as well), the coat at that place on the body.
        const data = new Uint8Array(size * size * 4), filled = new Uint8Array(size * size), near = new Float32Array(size * size), haloF = new Int32Array(size * size), haloW = new Float32Array(size * size * 2);
        const atP = new Float32Array(size * size * 3), atN = new Float32Array(size * size * 3), atF = new Int32Array(size * size), atV = new Int32Array(size * size);
        const uvAt = v => (v < n ? [uvs[v * 2], uvs[v * 2 + 1]] : extra[v - first].uv);
        const src = v => (v < n ? v : extra[v - first].from);
        for (let t = 0; t < T; t++) {
            const ids = [out[t * 3], out[t * 3 + 1], out[t * 3 + 2]], q = ids.map(uvAt).map(u => [u[0] * size, u[1] * size]), vs = ids.map(src);
            const area2 = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[2][0] - q[0][0]) * (q[1][1] - q[0][1]);
            if (Math.abs(area2) < 1e-9) continue;
            const x0 = Math.max(0, Math.floor(Math.min(q[0][0], q[1][0], q[2][0]) - 2)), x1 = Math.min(size - 1, Math.ceil(Math.max(q[0][0], q[1][0], q[2][0]) + 2));
            const y0 = Math.max(0, Math.floor(Math.min(q[0][1], q[1][1], q[2][1]) - 2)), y1 = Math.min(size - 1, Math.ceil(Math.max(q[0][1], q[1][1], q[2][1]) + 2));
            // How far a texel lies past each edge, in texels.
            const elen = [[1, 2], [2, 0], [0, 1]].map(([a, b]) => Math.hypot(q[b][0] - q[a][0], q[b][1] - q[a][1]) || 1);
            // Per-face constants hoisted out of the texel loop (the arithmetic per texel is unchanged).
            const qx0 = q[0][0], qy0 = q[0][1], qx1 = q[1][0], qy1 = q[1][1], qx2 = q[2][0], qy2 = q[2][1], absArea = Math.abs(area2);
            const e0 = elen[0], e1 = elen[1], e2 = elen[2], a0 = vs[0] * 3, b0 = vs[1] * 3, c0 = vs[2] * 3;
            for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
                const o = y * size + x;
                if (filled[o] === 2) continue;
                const px = x + 0.5, py = y + 0.5;
                let w1 = ((px - qx0) * (qy2 - qy0) - (qx2 - qx0) * (py - qy0)) / area2;
                let w2 = ((qx1 - qx0) * (py - qy0) - (px - qx0) * (qy1 - qy0)) / area2;
                let w0 = 1 - w1 - w2;
                const inside = w0 >= -1e-6 && w1 >= -1e-6 && w2 >= -1e-6;
                if (!inside) {
                    // Past the edge, up to a few texels: the coat as it runs on across the edge (the face's plane
                    // carried on), so the filtered picture meets the next chart's colors and no stair-step shows.
                    // The nearest face to a texel paints it.
                    const past = Math.max(-w0 * absArea / e0, -w1 * absArea / e1, -w2 * absArea / e2);
                    if (filled[o] === 2 || past > 1.6 || (haloF[o] && near[o] <= past)) continue;
                    // Painted once all faces are in, from the nearest.
                    near[o] = past; haloF[o] = t + 1; haloW[o * 2] = w0; haloW[o * 2 + 1] = w1;
                    continue;
                }
                const p = [w0 * positions[a0] + w1 * positions[b0] + w2 * positions[c0], w0 * positions[a0 + 1] + w1 * positions[b0 + 1] + w2 * positions[c0 + 1], w0 * positions[a0 + 2] + w1 * positions[b0 + 2] + w2 * positions[c0 + 2]];
                const nx = w0 * normals[a0] + w1 * normals[b0] + w2 * normals[c0], ny = w0 * normals[a0 + 1] + w1 * normals[b0 + 1] + w2 * normals[c0 + 1], nz = w0 * normals[a0 + 2] + w1 * normals[b0 + 2] + w2 * normals[c0 + 2];
                const nl = Math.hypot(nx, ny, nz) || 1, nn = [nx / nl, ny / nl, nz / nl];
                const main = w0 >= w1 && w0 >= w2 ? vs[0] : w1 >= w2 ? vs[1] : vs[2];
                const c = colorAt(p, nn, tags[main]);
                data[o * 4] = Math.round(clamp(c[0], 0, 1) * 255); data[o * 4 + 1] = Math.round(clamp(c[1], 0, 1) * 255); data[o * 4 + 2] = Math.round(clamp(c[2], 0, 1) * 255); data[o * 4 + 3] = 255;
                filled[o] = inside ? 2 : 1;
                // Where it lies on the body and on which face, so an edge texel can be painted again finer.
                atP[o * 3] = p[0]; atP[o * 3 + 1] = p[1]; atP[o * 3 + 2] = p[2];
                atN[o * 3] = nn[0]; atN[o * 3 + 1] = nn[1]; atN[o * 3 + 2] = nn[2];
                atF[o] = t + 1; atV[o] = main;
            }
        }
        for (let o = 0; o < size * size; o++) {
            if (filled[o] || !haloF[o]) continue;
            const t = haloF[o] - 1, vs = [src(out[t * 3]), src(out[t * 3 + 1]), src(out[t * 3 + 2])];
            const w = [haloW[o * 2], haloW[o * 2 + 1], 1 - haloW[o * 2] - haloW[o * 2 + 1]];
            const p = [0, 1, 2].map(i => w[0] * positions[vs[0] * 3 + i] + w[1] * positions[vs[1] * 3 + i] + w[2] * positions[vs[2] * 3 + i]);
            const nn = norm([0, 1, 2].map(i => w[0] * normals[vs[0] * 3 + i] + w[1] * normals[vs[1] * 3 + i] + w[2] * normals[vs[2] * 3 + i]));
            const c = colorAt(p, nn, tags[w[0] >= w[1] && w[0] >= w[2] ? vs[0] : w[1] >= w[2] ? vs[1] : vs[2]]);
            data[o * 4] = Math.round(clamp(c[0], 0, 1) * 255); data[o * 4 + 1] = Math.round(clamp(c[1], 0, 1) * 255); data[o * 4 + 2] = Math.round(clamp(c[2], 0, 1) * 255); data[o * 4 + 3] = 255;
            filled[o] = 1;
        }
        // Texels on a sharp edge of the pattern (a stripe's, a spot's) painted again as the mean of four
        // samples within them, so the edge is smooth in the picture rather than stepped.
        const lumOf = o => data[o * 4] * 0.3 + data[o * 4 + 1] * 0.55 + data[o * 4 + 2] * 0.15;
        const redo = [];
        for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
            const o = y * size + x;
            if (!atF[o]) continue;
            const l = lumOf(o);
            if (Math.abs(lumOf(o + 1) - l) > 34 || Math.abs(lumOf(o - 1) - l) > 34 || Math.abs(lumOf(o + size) - l) > 34 || Math.abs(lumOf(o - size) - l) > 34) redo.push(o);
        }
        // The body's step for one texel along the picture's two axes on a face.
        const stepOf = t => {
            const ids = [out[t * 3], out[t * 3 + 1], out[t * 3 + 2]], q = ids.map(uvAt).map(u => [u[0] * size, u[1] * size]), vs = ids.map(src);
            const area2 = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[2][0] - q[0][0]) * (q[1][1] - q[0][1]), inv = 1 / area2;
            const P0 = vs.map(v => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]]), e1 = sub(P0[1], P0[0]), e2 = sub(P0[2], P0[0]);
            const du = [(q[2][1] - q[0][1]) * inv, -(q[1][1] - q[0][1]) * inv], dv = [-(q[2][0] - q[0][0]) * inv, (q[1][0] - q[0][0]) * inv];
            return [add(mul(e1, du[0]), mul(e2, du[1])), add(mul(e1, dv[0]), mul(e2, dv[1]))];
        };
        const steps = new Map();
        for (const o of redo) {
            const t = atF[o] - 1;
            if (!steps.has(t)) steps.set(t, stepOf(t));
            const du = steps.get(t), p = [atP[o * 3], atP[o * 3 + 1], atP[o * 3 + 2]], nn = [atN[o * 3], atN[o * 3 + 1], atN[o * 3 + 2]], tag = tags[atV[o]], sum = [0, 0, 0];
            for (const [a, b] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
                const c = colorAt(add(p, add(mul(du[0], a), mul(du[1], b))), nn, tag);
                sum[0] += c[0] / 4; sum[1] += c[1] / 4; sum[2] += c[2] / 4;
            }
            for (let k = 0; k < 3; k++) data[o * 4 + k] = Math.round(clamp(sum[k], 0, 1) * 255);
        }
        // Grow every chart's edge outward a few texels, so filtering and smaller mip levels stay on coat.
        // Each pass reads the coverage as it was when the pass began; a texel takes its first filled
        // neighbour in the order right, left, below, above.
        const growTo = new Int32Array(size * size), growFrom = new Int32Array(size * size);
        for (let pass = 0; pass < 6; pass++) {
            let grown = 0;
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                const o = y * size + x;
                if (filled[o]) continue;
                const f = x + 1 < size && filled[o + 1] ? o + 1 : x > 0 && filled[o - 1] ? o - 1 : y + 1 < size && filled[o + size] ? o + size : y > 0 && filled[o - size] ? o - size : -1;
                if (f < 0) continue;
                growTo[grown] = o; growFrom[grown++] = f;
            }
            for (let i = 0; i < grown; i++) { const o = growTo[i], f = growFrom[i]; data.copyWithin(o * 4, f * 4, f * 4 + 4); filled[o] = 1; }
        }
        for (let y = size - 6; y < size; y++) for (let x = 0; x < 6; x++) data.fill(255, (y * size + x) * 4, (y * size + x) * 4 + 4);
        return { uvs, index: out, extra, white: [3 / size, (size - 3) / size], texture: { width: size, height: size, data, name: 'creaturecoat.png' } };
    }

    /**
     * A non-quadruped body (RRCreatureForms). Birds carry their feather
     * pictures on their parts (`pictures`), gathered here into the textures,
     * and move by their own folding-wing motions (RRCreatureFlyers.poseClip).
     */
    function formBuild(given, options) {
        const out = Forms.build(given, options);
        for (const p of out.parts) if (p.pictures) { Object.assign(out.textures, p.pictures); delete p.pictures; }
        if (given.morphology === 'avian' && out.bones[0]?.birdFrame && Flyers?.poseClip && out.clips?.length) {
            const byName = { Idle: 'idle', Walk: 'walk', Run: 'run', Fly: 'fly', Swim: 'swim', Glide: 'glide', Turn: 'turn', Attack: 'attack' };
            out.clips = out.clips.map(c => Flyers.poseClip(out.bones, byName[c.name] || 'idle', given)?.saved || c);
        }
        if (given.morphology === 'avian' || given.morphology === 'reptile') {
            // Birds (and reptiles) paint their own feather pictures; the generic surface maps are unused, so leave them out of the file.
            const used = new Set(out.parts.flatMap(p => [p.texture, p.normalTexture, p.metallicRoughnessTexture, p.emissiveTexture, p.occlusionTexture, p.iridescenceThicknessTexture]).filter(Boolean));
            for (const name of Object.keys(out.textures)) if (!used.has(name)) delete out.textures[name];
        }
        return out;
    }

    /** The recipe as its sex wears it: a female grows no lion's mane and no antlers. */
    function asShown(r) {
        if (r.anatomy.sex !== 'female' || (r.mane !== 'lion' && r.horns !== 'antlers')) return r;
        return Object.assign({}, r, { mane: r.mane === 'lion' ? 'none' : r.mane, horns: r.horns === 'antlers' ? 'none' : r.horns });
    }

    /**
     * The whole creature: { parts, bones, height, plan, rig, clips, textures }.
     * `options.quality` 'preview' (coarser, for live sliders) or 'save';
     * `options.hairBudget` scales the strand cards (1 full; weak graphics less);
     * `options.draft` (a slider being dragged) paints a preview's coat picture at half size.
     */
    function build(recipe, options) {
        const given = normalizeRecipe(recipe);
        if (given.morphology !== 'quadruped') return formBuild(given, options);
        const r = asShown(given);
        const o = options || {};
        const quality = o.quality || 'save';
        const save = quality !== 'preview';
        const budget = clamp(o.hairBudget == null ? 1 : o.hairBudget, 0, 2);
        const lay = layout(r);
        const shapes = shapesOf(r, lay).filter(shape => (!o.headOnly || shape.bone === 'Head') && (!o.headless || (shape.bone !== 'Head' && shape.bone !== 'Neck')));
        // Centaur hook (RRCharacterCentaur): with `headless` no neck or head, and the caller's own shapes (a waist from the withers).
        if (o.extraShapes) shapes.push(...o.extraShapes(lay, { cone, ellipsoid, flatten }));
        if (!o.headOnly) attachTail(r, lay, shapes);
        lay.shapes = shapes;
        const bones = bonesOf(lay);
        const boneIndex = new Map(bones.map((b, i) => [b.name, i]));
        const lofts = loftsOf(r, lay).filter(piece => (!o.headOnly || ['ear', 'brow', 'forelock', 'beak', 'crest', 'horn', 'tusk', 'tooth', 'tongue'].includes(piece.tag)) && (!o.headless || !['ear', 'brow', 'forelock', 'beak', 'crest', 'horn', 'tusk', 'tooth', 'tongue', 'whisker', 'mane'].includes(piece.tag)));
        const prof = profileOf(r);
        // Grid cell in body units, coarser for a very long body so the grid stays in bounds.
        let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const s of shapes) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], s.lo[i]); hi[i] = Math.max(hi[i], s.hi[i]); }
        const longest = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
        const cell = Math.max(save ? 0.0068 : r.kind === 'cat' ? 0.010 : 0.019, longest / (save ? 360 : r.kind === 'cat' ? 240 : 150)) * Math.min(1.25, Math.max(0.85, lay.g));
        const seed = r.seed % 997;
        const fur = r.fluff * 0.006 * lay.g;
        // The coat's roughness: none over the face ahead of the eyes, where the hair is short (a sheep's wool
        // stops in a clean line behind its face).
        const Jf = lay.J, faceLine = profileOf(r).face === 'sheep' ? -0.35 : 0.15;
        const shortFace = (x, y, z) => { const dy = y - Jf.skull[1], dz = z - Jf.skull[2]; return smooth(faceLine + 0.15, faceLine, (dy * Jf.hdir[1] + dz * Jf.hdir[2]) / Jf.skullR); };
        const net = surfaceNet(shapes, cell, fur > 0 ? { amp: fur, at: (x, y, z) => (fbm(x * 40, y * 40, z * 40, seed, 2) * 0.5 + 0.5 * Math.abs(valueNoise(x * 90, y * 90, z * 90, seed + 3))) * shortFace(x, y, z) } : null);
        let positions = relaxMesh(net.positions, net.index, 1);
        positions = projectMesh(positions, net, cell);
        let index = net.index;
        // The saved body: the fine mesh reduced where it is flat, kept where it curves.
        if ((save || r.kind==='cat') && Decimator) {
            const target = save?30000:38000;
            if (index.length / 3 > target * 1.1) {
                // The finely painted face keeps its small faces: the muzzle and lips ahead of the eyes, the lids and rims round them.
                const locked = new Uint8Array(positions.length / 3);
                const { J } = lay, sk = J.skull, faceFrom = (J.mouth.z0 - 0.3) * J.skullR;
                const keep = lay.eyes.map(e => [e.center, e.R * 2.1]);
                let face = 0;
                for (let v = 0; v < locked.length; v++) {
                    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
                    const hz = ((y - sk[1]) * J.hdir[1] + (z - sk[2]) * J.hdir[2]) / J.skullR, hy = ((y - sk[1]) * J.hup[1] + (z - sk[2]) * J.hup[2]) / J.skullR;
                    if (hz > faceFrom / J.skullR && hz < J.mouth.zt + 0.5 && hy < 0.6 && hy > -1.1 && Math.abs(x) < 1.2 * J.skullR) { locked[v] = 2; face++; continue; }
                    for (const [c, rad] of keep) if ((x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2 < rad * rad) { locked[v] = 1; break; }
                }
                // A head grown huge keeps only its eyes' faces, so the body still comes down to its count.
                if (face > locked.length * 0.1) for (let v = 0; v < locked.length; v++) if (locked[v] === 2) locked[v] = 0;
                const d = Decimator.decimate({ positions, indices: Uint32Array.from(index), locked }, target, { boundaryWeight: 100 });
                positions = d.positions; index = Array.from(d.indices);
            }
        }
        // The breed's actual socket surface supplies the eyelid boundary.
        const normals = faceNormals(positions, index);
        const vcount = positions.length / 3;
        // Per vertex: its nearest shape (for the coat) and blended bone weights.
        const C = {};
        for (const c of COLORS) C[c.key] = hexRgb(r.colors[c.key]);
        const colors = new Float32Array(vcount * 3);
        const joints = new Uint8Array(vcount * 4), weights = new Float32Array(vcount * 4);
        const tags = new Array(vcount);
        const blend = 0.035 * lay.g;
        const unions = shapes.filter(s => !s.cut && !s.envelope);
        const limbOf = unions.map(sh => { const m = /^(Left|Right)(Front|Rear)/.exec(sh.bone); return m ? m[0] : ''; });
        const upper = unions.map(sh => sh.tag === 'upperleg' || sh.tag === 'thigh');
        const unionBone = unions.map(sh => boneIndex.get(sh.bone));
        const dist = new Float64Array(unions.length);
        const reach = blend * 5;
        const byBone = new Map();
        /** The bones a point answers to (byBone filled), and its nearest shape. */
        const weigh = p => {
            let best = 0, bestD = Infinity;
            for (let s = 0; s < unions.length; s++) {
                const sh = unions[s];
                // Far past its box a shape cannot weigh in.
                const bx = Math.max(sh.lo[0] - p[0], 0, p[0] - sh.hi[0]), by = Math.max(sh.lo[1] - p[1], 0, p[1] - sh.hi[1]), bz = Math.max(sh.lo[2] - p[2], 0, p[2] - sh.hi[2]);
                if (bx > reach + 0.05 || by > reach + 0.05 || bz > reach + 0.05) { dist[s] = Infinity; continue; }
                const d = shapeDistance(sh, p);
                dist[s] = d;
                if (d < bestD) { bestD = d; best = s; }
            }
            byBone.clear();
            // A leg's skin answers to that leg and the body, never to another leg.
            const own = limbOf[best];
            for (let s = 0; s < unions.length; s++) {
                if (dist[s] === Infinity) continue;
                if (limbOf[s] && limbOf[s] !== own && (own || !upper[s])) continue;
                const w = Math.exp(-(dist[s] - bestD) / blend);
                if (w < 0.01) continue;
                const b = unionBone[s];
                byBone.set(b, (byBone.get(b) || 0) + w);
            }
            if (!byBone.size) byBone.set(boneIndex.get('Chest'), 1);
            return best;
        };
        for (let v = 0; v < vcount; v++) {
            const p = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
            const best = weigh(p);
            setSkin(joints, weights, v, byBone);
            tags[v] = unions[best].tag;
            const n = [normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]];
            const c = coatColor(r, lay, p, n, tags[v], C);
            colors[v * 3] = c[0]; colors[v * 3 + 1] = c[1]; colors[v * 3 + 2] = c[2];
        }
        const coat = { positions: Array.from(positions), index: Array.from(index), colors: Array.from(colors), joints: Array.from(joints), weights: Array.from(weights) };
        const bodyFaces = index.length;
        const horn = { positions: [], index: [], colors: [], joints: [], weights: [] }, claws = { positions: [], index: [], colors: [], joints: [], weights: [] };
        // Lofted pieces join the coat (ears, tails) or the horn part.
        // Ears grow their own fur: short hair lying up the back toward the tip, pale tufts standing out of the hollow's rim.
        const earFur = [], earRand = rng(seed + 61), earFurry = budget > 0 && !o.static && profileOf(r).face !== 'reptile';
        for (const piece of lofts) {
            // Claws are their own part (every paw has them now); horns, tusks and beaks stay together.
            const target = piece.tag === 'claw' ? claws : piece.kind === 'horn' ? horn : coat;
            const base = target.positions.length / 3;
            const m = piece.mesh;
            const pn = piece.tag === 'ear' ? faceNormals(Float32Array.from(m.positions), m.index) : null;
            for (let i = 0; i < m.positions.length / 3; i++) {
                const p = [m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]];
                target.positions.push(p[0], p[1], p[2]);
                const t = m.t[i];
                let c;
                if (piece.kind === 'horn') {
                    // Horns darken toward the base, tusks and spines toward the tip; claws are the hooves' color.
                    // Growth rings show as fine darker lines across a horn (close-set on a ram's).
                    const rings = piece.tag === 'horn' ? Math.pow(Math.abs(Math.cos(t * Math.PI * (r.horns === 'ram' ? 30 : r.horns === 'dragon' ? 12 : 9))), 10) : 0;
                    const shade = (piece.tag === 'horn' ? 0.7 + 0.3 * t : 1 - 0.25 * t) * (1 - 0.16 * rings);
                    // A cat's sheathed claws show only their pale translucent tips.
                    if (piece.tag === 'shell') c = piece.paint(C, i);
                    else if (piece.tag === 'disc') c = mixRgb(mixRgb(C.nose, mul(C.nose, 0.82), smooth(0.5, 0.75, t)), mul(C.nose, 0.18), smooth(1.1, 0.7, piece.inHole(p)));
                    else c = piece.tag === 'claw' ? (prof.felid && r.feet !== 'claw' ? mixRgb([0.8, 0.76, 0.7], [0.95, 0.93, 0.9], t) : mixRgb(C.hoof, [0.85, 0.82, 0.75], 0.25 * t)) : mul(C.horn, shade);
                    // A beak: its own color, a little lighter along it, a raptor's darkening to its tip.
                    if (piece.tag === 'beak') {
                        const bk = lay.beak;
                        c = mixRgb(mul(C.horn, 1.05 + 0.2 * t), mul(C.horn, 0.45), bk.hooked * smooth(0.6, 0.95, t));
                        // A raptor's cere: the bare skin over the beak's root, the eye ring's color, the nostrils in it.
                        if (bk.hooked) c = mixRgb(c, C.nose, smooth(0.24, 0.16, t));
                        if (t < 0.35) for (const h of bk.holes) c = mixRgb(c, mul(C.nose, 0.15), smooth(bk.holeR, bk.holeR * 0.5, len(sub(p, h))));
                    }
                } else if (piece.kind === 'hair') {
                    c = mixRgb(C.mane, C.coat, piece.tag === 'tail' && r.tail === 'bushy' ? 0.7 : 0);
                    if(r.kind==='cat'&&piece.tag==='tail'&&r.pattern==='points')c=C.marking;
                    if (piece.tag === 'tuft') c = mixRgb(C.mane, C.marking, 0.5);
                    if (r.tail === 'bushy' && t > 0.85 && r.pattern !== 'solid') c = mixRgb(c, r.kind === 'fox' ? C.light : C.marking, smooth(0.85, 0.95, t));
                } else if (piece.tag === 'ear') {
                    const n = [pn[i * 3], pn[i * 3 + 1], pn[i * 3 + 2]];
                    c = coatColor(r, lay, p, n, 'ear', C);
                    // The ear's back: the coat, dark on a cat's. Its hollow: pale skin under fine light hairs
                    // that run up from the root, the rim round it the coat's own color.
                    const f = m.face[i], u = m.u[i], inside = smooth(0.15, -0.35, f) * smooth(0.95, 0.7, Math.abs(u));
                    if (prof.padColor && r.pattern !== 'solid') c = mixRgb(c, C.marking, smooth(0.0, 0.5, f) * 0.75 * r.patternAmount * smooth(0.2, 0.6, t));
                    const hairs = 0.5 + 0.5 * Math.sin(u * 37 + 3 * Math.sin(t * 9)) * Math.sin(u * 23 - t * 5);
                    // The hollow: warm skin under sparse pale hairs, a little of the coat's own tone in it.
                    const skinTone = r.kind === 'cat' ? mixRgb(C.light, [0.86, 0.72, 0.68], 0.3) : mixRgb(mixRgb(C.light, C.coat, 0.35), [0.78, 0.58, 0.54], 0.3);
                    const lining = mixRgb(skinTone, C.light, hairs * smooth(0.1, 0.5, t) * 0.7);
                    c = mixRgb(c, mixRgb(lining, mul(lining, 0.72), smooth(0.25, 0.0, t)), inside * 0.9);
                } else {
                    c = coatColor(r, lay, p, [0, 0, 1], piece.tag, C);
                    if (piece.tag === 'tail' && r.pattern === 'points') c = mixRgb(c, C.marking, smooth(0.4, 0.9, t) * r.patternAmount);
                    if (piece.tag === 'tail' && r.kind === 'armadillo') { const ring = t * 14 - Math.floor(t * 14), sc = Math.abs(Math.sin((p[0] / Math.max(1e-4, Math.hypot(p[0], p[1] - (lay.J.tail[0] || [0, 0])[1]))) * 9)); c = mixRgb(mul(C.horn, 0.92 + 0.1 * sc), C.light, 0.45 * smooth(0.82, 1, ring) + 0.15 * smooth(0.3, 0, ring)); }
                    if (piece.tag === 'tail' && r.pattern === 'stripes' && r.kind === 'tiger') {
                        // Uneven dark rings, closer toward the end, and a black tip.
                        const x = t * 9 + 2.2 * t * t, ri = Math.floor(x), f = x - ri, w = 0.2 + 0.12 * hash3(ri, 1, 2, r.seed % 1000);
                        c = mixRgb(c, C.marking, Math.max(smooth(w, w * 0.6, Math.abs(f - 0.5)) * smooth(0.05, 0.12, t), smooth(0.86, 0.9, t)) * r.patternAmount);
                    } else if (piece.tag === 'tail' && r.pattern === 'stripes') c = mixRgb(c, C.marking, (Math.sin(t * 30) > 0.3 ? 1 : 0) * r.patternAmount);
                    if (piece.tag === 'crest') c = mixRgb(C.mane, C.marking, smooth(0.4, 1, t) * 0.5);
                    if (piece.tag === 'tail' && r.tail === 'tufted' && t > 0.88) c = mixRgb(c, mixRgb(C.mane, C.marking, 0.5), smooth(0.88, 0.95, t));
                }
                target.colors.push(c[0], c[1], c[2]);
                const map = new Map();
                for (const [name, w] of piece.weights(t)) { const b = boneIndex.get(name); if (b != null) map.set(b, (map.get(b) || 0) + w); }
                if (!map.size) map.set(boneIndex.get('Head'), 1);
                const j4 = new Uint8Array(4), w4 = new Float32Array(4);
                setSkin(j4, w4, 0, map);
                target.joints.push(...j4); target.weights.push(...w4);
                if (earFurry && piece.tag === 'ear' && earRand() < (save ? 0.3 : 0.25)) {
                    const n = [pn[i * 3], pn[i * 3 + 1], pn[i * 3 + 2]], f = m.face[i], u = m.u[i], np = m.positions.length / 3 - 1;
                    const tip = [m.positions[np * 3], m.positions[np * 3 + 1], m.positions[np * 3 + 2]], up = norm(sub(tip, p)), g = lay.g, es = Math.min(1.6, r.earSize);
                    const skin = { joints: Array.from(j4), weights: Array.from(w4) };
                    // A cat's ear furnishings: fine pale hairs fanning up and out of the hollow (its back stays sleek).
                    if (r.kind === 'cat') { if (f < -0.2 && t > 0.1 && t < 0.7 && Math.abs(u) < 0.75 && earRand() < 0.7) earFur.push({ p, n, flow: norm(add(mul(up, 0.75), mul(n, 0.55))), len: (0.016 + 0.014 * earRand()) * g * es, width: 0.004 * g, lift: 0.3, droop: 0.05, color: mixRgb(C.light, [1, 1, 1], 0.3), tipColor: C.light, ...skin }); }
                    else if (f > 0.3 && Math.abs(u) < 0.7 && t < 0.85) earFur.push({ p, n, flow: up, len: (0.012 + 0.012 * t) * g * es, width: 0.004 * g, lift: 0.1, droop: 0.05, color: mul(c, 0.95 + 0.1 * earRand()), tipColor: mixRgb(c, C.light, 0.1), ...skin });

                }
            }
            for (const q of m.index) target.index.push(q + base);
        }
        // Teats: small rounded cones on the belly in two rows, or under the udder.
        if (!o.headOnly && r.anatomy.detail && r.anatomy.sex === 'female' && prof.teats) teatsOf(r, lay, net, coat, boneIndex, C);
        // Wings: a part of their own, seen from both sides; the root follows the chest.
        const wings = { positions: [], index: [], colors: [], joints: [], weights: [] };
        if (lay.J.wing) {
            const w = wingOf(r, lay);
            const chest = boneIndex.get('Chest');
            const tones = { bone: C.coat, coat: C.coat, membrane: mixRgb(C.marking, C.coat, 0.35), flight: mixRgb(C.coat, C.marking, 0.5), marking: C.marking };
            for (const [sideName, flip] of [['Left', same], ['Right', mirror]]) {
                const wingBone = boneIndex.get(sideName + 'Wing');
                const base = wings.positions.length / 3;
                for (let i = 0; i < w.positions.length / 3; i++) {
                    wings.positions.push(...flip([w.positions[i * 3], w.positions[i * 3 + 1], w.positions[i * 3 + 2]]));
                    const c = tones[w.tone[i]];
                    wings.colors.push(c[0], c[1], c[2]);
                    const out = smooth(0.02 * w.ws, 0.25 * w.ws, w.reach[i]);
                    wings.joints.push(wingBone, chest, 0, 0); wings.weights.push(out, 1 - out, 0, 0);
                }
                // The mirror turns the winding: flip it back so both wings face out alike.
                for (let t = 0; t < w.index.length; t += 3) {
                    const [a, b2, c] = [w.index[t] + base, w.index[t + 1] + base, w.index[t + 2] + base];
                    if (sideName === 'Left') wings.index.push(a, b2, c); else wings.index.push(a, c, b2);
                }
            }
        }
        // Eyes: in their sockets, an iris round the pupil (round, upright slit or bar across) and the white hidden in the lids.
        const eyes = { positions: [], index: [], colors: [], joints: [], weights: [], uvs: [] };
        const head = boneIndex.get('Head');
        const iris = hexRgb(r.colors.eye);
        for (const eye of lay.eyes) {
            const ball = eyeball(eye.center, eye.R, eye.facing, lay.hu, 12, 32);
            const base = eyes.positions.length / 3;
            for (let i = 0; i < ball.positions.length / 3; i++) {
                eyes.positions.push(ball.positions[i * 3], ball.positions[i * 3 + 1], ball.positions[i * 3 + 2]);
                const lx = ball.local[i * 3], ly = ball.local[i * 3 + 1], lz = ball.local[i * 3 + 2];
                eyes.uvs.push(0.5 + lx * 0.5, 0.5 + ly * 0.5);
                let col;
                if (lz < 0.55) col = mixRgb(iris, [0.1, 0.07, 0.05], 0.7);
                else {
                    const pupil = prof.pupil === 'slit' ? Math.abs(lx) < 0.09 && Math.abs(ly) < 0.6 : prof.pupil === 'bar' ? Math.abs(ly) < 0.16 && Math.abs(lx) < 0.5 : Math.hypot(lx, ly) < 0.36;
                    const ring = smooth(0.62, 0.7, lz) * (1 - smooth(0.93, 0.99, lz) * 0.2);
                    col = pupil ? [0.015, 0.012, 0.012] : mixRgb(mul(iris, 0.55), mixRgb(iris, [1, 0.95, 0.8], 0.12), ring);
                }
                eyes.colors.push(col[0], col[1], col[2]);
                eyes.joints.push(head, 0, 0, 0); eyes.weights.push(1, 0, 0, 0);
            }
            for (const q of ball.index) eyes.index.push(q + base);
        }
        // Strand cards: the lion's mane and the tail's tuft, a shaggy coat over the body, as the budget allows.
        const cards = furRoots(r, lay, coat, tags, normals, vcount, C, boneIndex, budget, save);
        if (earFur.length) cards.roots.push(...earFur);
        // Into meters, on the floor.
        const S = r.size;
        const parts = [];
        // The floor is where the feet stand: the body's lowest point (lofted pieces may dip under it).
        let minY = Infinity;
        for (let i = 1; i < vcount * 3; i += 3) minY = Math.min(minY, positions[i]);
        const place = arr => { const out = new Float32Array(arr.length); for (let i = 0; i < arr.length; i += 3) { out[i] = arr[i] * S; out[i + 1] = (arr[i + 1] - minY) * S; out[i + 2] = arr[i + 2] * S; } return out; };
        const finish = (name, part, extra) => {
            if (!part.positions.length) return;
            const pos = place(part.positions);
            const idx = Uint32Array.from(part.index);
            parts.push(Object.assign({
                name, positions: pos, normals: faceNormals(pos, idx), index: idx,
                colors: Float32Array.from(part.colors, toLinear),
                joints: Uint8Array.from(part.joints), weights: Float32Array.from(part.weights)
            }, extra));
        };
        const textures = {};
        // A fine pattern (stripes, spots) is painted into a picture over the body: finer than its faces.
        let atlas = null;
        const furry = r.fluff > 0.3 || r.kind === 'cat' || prof.face === 'bird';
        if (!o.static || (FINE_PATTERNS.has(r.pattern) && r.patternAmount > 0.15) || furry || prof.face !== 'reptile') {
            const total = coat.positions.length / 3;
            // The face (its lids, lips, nose, whisker spots) is painted finer than the rest.
            const I = coat.index, keep = new Uint8Array(vcount);
            for (let v = 0; v < vcount; v++) keep[v] = HEAD_TAGS.has(tags[v]) ? 1 : 0;
            // While a slider is dragged (`draft`), the preview coat is painted at half size; the whole picture follows on release.
            const coatSize = r.kind === 'cat' ? (save ? 2048 : 1024) : save ? 1536 : 768;
            const haired = furry || prof.face !== 'reptile';
            atlas = coatAtlas(positions, I.slice(0, bodyFaces), normals, tags, keep, (p, n, tag) => { const c = coatColor(r, lay, p, n, tag, C); return haired ? mul(c, coatGrain(r, lay, p, n, tag)) : c; }, o.draft && !save ? coatSize / 2 : coatSize, total);
            if (atlas) {
                const uvs = new Float32Array((total + atlas.extra.length) * 2);
                uvs.set(atlas.uvs);
                for (let v = vcount; v < total; v++) { uvs[v * 2] = atlas.white[0]; uvs[v * 2 + 1] = atlas.white[1]; }
                atlas.extra.forEach((e, k) => {
                    const v = total + k;
                    coat.positions.push(positions[e.from * 3], positions[e.from * 3 + 1], positions[e.from * 3 + 2]);
                    coat.joints.push(...coat.joints.slice(e.from * 4, e.from * 4 + 4)); coat.weights.push(...coat.weights.slice(e.from * 4, e.from * 4 + 4));
                    coat.colors.push(1, 1, 1);
                    uvs[v * 2] = e.uv[0]; uvs[v * 2 + 1] = e.uv[1];
                });
                for (let v = 0; v < vcount * 3; v++) coat.colors[v] = 1;
                coat.index = atlas.index.concat(coat.index.slice(bodyFaces));
                coat.uvs = uvs;
                textures['creaturecoat.png'] = atlas.texture;
            }
        }
        // A periodic skin-pore normal over a packed fur atlas produced diagonal bands
        // on unmarked coats, especially the cats' haunches. Fur already has directional color grain.
        // Only a reptile's scales take the periodic relief; on hair it read as a diamond lattice (horse, dog, deer, cattle).
        const coatRelief = atlas && !o.static && !furry && prof.face === 'reptile';
        if (coatRelief) textures['creature-coat-normal.png'] = Forms.surfacePictures(prof.face === 'reptile' ? 'scales' : 'pores', save ? 512 : 256)['creature-surface-normal.png'];
        finish('Body', coat, atlas ? { roughness: furry ? 0.85 : 0.7, uvs: coat.uvs, texture: 'creaturecoat.png', keepColors: true,
            ...(coatRelief ? { normalTexture: 'creature-coat-normal.png', normalScale: prof.face === 'reptile' ? 0.3 : 0.18 } : {}) } : { roughness: 0.85 });
        if (atlas) {
            // The body's split vertices take the normal of the vertex they split from, so no seam shows in the light.
            const body = parts[parts.length - 1], N = body.normals;
            for (let v = 0; v < vcount; v++) N.set([normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]], v * 3);
            atlas.extra.forEach((e, k) => N.set([normals[e.from * 3], normals[e.from * 3 + 1], normals[e.from * 3 + 2]], (coat.positions.length / 3 - atlas.extra.length + k) * 3));
        }
        finish('Horns', horn, { roughness: 0.45 });
        finish('Claws', claws, { roughness: 0.4 });
        // Whiskers (vibrissae): rooted in staggered rows on each whisker pad, each fanning out by its own row
        // (upper rows angled up, lower down) and column (back ones swept back, front ones forward) so they spread
        // apart and never cross, with a gentle backward droop and fine tips. Sized to the head.
        const whiskerLines = [];
        const WH = WHISKERS[r.kind];
        if (WH && lay.whiskerPad && !o.headless) {
            const P = root.RRCharacterProps || require('./CharacterProps.js'), m = new P.ExactMesh(), skin = P.rigid(boneIndex.get('Head')), wp = lay.whiskerPad, sr0 = lay.sr;
            const rad = sr0 * 0.0023 * WH.thick;
            for (const s of [-1, 1]) for (let row = 0; row < WH.rows; row++) for (let j = 0; j < WH.cols; j++) {
                const ru = WH.rows > 1 ? row / (WH.rows - 1) : 0.5, cu = WH.cols > 1 ? j / (WH.cols - 1) : 0.5;
                const from = lay.H(s * 0.1, wp.y + WH.dy * (0.5 - ru) * (WH.rows - 1), wp.z + WH.dz * (cu - 0.5) * (WH.cols - 1) + (row % 2) * WH.dz * 0.5), out = norm(add([s * 0.82, 0, 0], mul(lay.hd, 0.57)));
                let start = from;
                for (let k = 0; k < 100; k++) { const q = add(from, mul(out, k * sr0 * 0.015)); if (fieldAt(lay.headShapes, q) > 0) { start = sub(q, mul(out, sr0 * 0.012)); break; } }
                const el = WH.up * (1 - 2 * ru), az = 0.12 + WH.fan * (2 * cu - 1), length = sr0 * WH.len * (0.8 + 0.3 * (1 - cu)) * (1 - 0.18 * Math.abs(ru - 0.5));
                const dir = norm(add(add([s * Math.cos(el) * Math.cos(az), 0, 0], mul(lay.hu, Math.sin(el))), mul(lay.hd, Math.cos(el) * Math.sin(az))));
                const end = add(start, mul(dir, length)), bend = add(lerp(start, end, 0.5), add(mul(lay.hu, -length * 0.06), mul(lay.hd, -length * 0.05)));
                const at = t => add(add(mul(start, (1 - t) * (1 - t)), mul(bend, 2 * t * (1 - t))), mul(end, t * t));
                const pts = [0, 0.25, 0.5, 0.75, 1].map(at);
                m.tube(pts, [rad, rad * 0.8, rad * 0.58, rad * 0.32, rad * 0.05], 5, C.light, skin);
                whiskerLines.push({ side: s, pts, radius: rad });
            }
            if(r.catType==='maineCoon')for(const ear of lay.ears){
                const tip=ear.tip;if(!tip)continue;
                for(let j=0;j<6;j++)m.tube([tip,add(tip,[ear.side*.004*j,.025+.006*j,-.006])],[.0015,.00012],5,C.coat,skin);
            }
            finish('Whiskers',m.part('Whiskers'),{roughness:.7,kind:'hair',noShade:true});
        }
        // Local refinement preserves small anatomical forms without refining the entire creature.
        // Roots extend into the measured body surface; their bones follow the same pelvis/spine.
        if (!o.headOnly && lay.anatomyShapes?.length) {
            const smallDetail = r.anatomy.sex === 'female' ? Math.min(1, r.anatomy.vulva) : Math.min(1, r.anatomy.sheath);
            let detailCell = 0.008 * Math.max(0.5, lay.g) * smallDetail, detailNet;
            for (let attempt = 0; attempt < 12; attempt++) {
                detailNet = surfaceNet(lay.anatomyShapes, detailCell);
                if (detailNet.index.length / 3 <= 3200) break;
                detailCell *= 1.18;
            }
            const pos = projectMesh(relaxMesh(detailNet.positions, detailNet.index, 1), detailNet, detailCell);
            const nrm = faceNormals(pos, detailNet.index);
            const detail = { positions: Array.from(pos), index: detailNet.index, colors: [], joints: [], weights: [] };
            for (let v = 0; v < pos.length / 3; v++) {
                const p = Array.from(pos.subarray(v * 3, v * 3 + 3));
                const nearest = lay.anatomyShapes.filter(s => !s.cut).reduce((best, s) => shapeDistance(s, p) < shapeDistance(best, p) ? s : best);
                const col = coatColor(r, lay, p, Array.from(nrm.subarray(v * 3, v * 3 + 3)), nearest.tag, C);
                detail.colors.push(...col);
                detail.joints.push(boneIndex.get(nearest.bone), 0, 0, 0); detail.weights.push(1, 0, 0, 0);
            }
            finish('Anatomy', detail, { kind: 'skin', roughness: 0.72 });
        }
        finish('Wings', wings, { roughness: 0.75, doubleSided: true });
        // Every kind's eye carries its own picture (species pupil, fibred iris, wet highlight); the vertex colors stay as a fallback.
        const pupilKind = r.kind === 'cat' ? 'slit' : r.kind === 'fox' ? 'fox' : r.kind === 'drake' || prof.face === 'reptile' ? 'reptile' : r.kind === 'ram' ? 'goat' : prof.pupil === 'bar' ? 'bar' : prof.pupil === 'slit' ? 'slit' : 'round';
        textures['creature-eyes.png'] = eyeTexture(r.colors.eye, pupilKind);
        // White vertex colors under the picture (the saved file keeps a color set on every mesh).
        eyes.colors.fill(1);
        finish('Eyes', eyes, { roughness: 0.12, kind: 'eye', uvs: Float32Array.from(eyes.uvs), texture: 'creature-eyes.png', keepColors: true });
        // Gear, fitted to this body and skinned as it is.
        if (Gear && r.gear.length) {
            const skinAt = p => { weigh(p); const j4 = new Uint8Array(4), w4 = new Float32Array(4); setSkin(j4, w4, 0, byBone); return [Array.from(j4), Array.from(w4)]; };
            const headOnly = shapes.filter(s => s.bone === 'Head');
            const gearParts = Gear.build(r.gear, { r, lay, inside: p => fieldAt(net.near(p), p), insideHead: p => fieldAt(headOnly, p), skin: skinAt, loft, curve });
            const maneRoots=new Set(cards.roots),groomed=Gear.clearFur(cards.roots.concat(cards.coat),gearParts,lay.g);
            cards.roots=groomed.filter(h=>maneRoots.has(h));cards.coat=groomed.filter(h=>!maneRoots.has(h));
            for (const gp of gearParts){finish(gp.name, gp, { kind: gp.kind, roughness: gp.roughness, metalness: gp.metalness, doubleSided: true });if(gp.kind==='cloth')Object.assign(textures,Gear.detailSurface(parts.at(-1),gp.material));}
        }
        const fineCatFur=(roots,name)=>{
            const g=lay.g;
            const P=root.RRCharacterProps||require('./CharacterProps.js'),m=new P.ExactMesh(),compute=m.computeNormals.bind(m);m.computeNormals=()=>{};
            const limit=save?1400:1000;
            for(let i=0;i<Math.min(limit,roots.length);i++){
                const hair=roots[Math.floor(i*roots.length/Math.min(limit,roots.length))],nr=hair.n,flow=norm(add(hair.flow,mul(nr,.24))),length=hair.len*.65;
                const start=sub(hair.p,mul(nr,.0007*g)),mid=add(start,mul(flow,length*.55)),end=add(add(start,mul(flow,length)),mul(nr,length*.06));
                m.tube([start,mid,end],[.00065*g,.0004*g,.00002*g],3,hair.color,{joints:hair.joints,weights:hair.weights});
            }
            compute();finish(name,m.part(name),{kind:'hair',roughness:.98,envMapIntensity:.08,onSkin:true,noShade:true});
        };
        if(r.kind==='cat'){
            if(cards.roots.length)fineCatFur(cards.roots,'Fur');
            if(cards.coat.length)fineCatFur(cards.coat,'Coat fur');
        }
        if (r.kind!=='cat'&&cards.roots.length) {
            const c = strandCards(cards.roots, rng(seed + 19));
            const pos = place(c.positions);
            parts.push({ name: 'Fur', positions: pos, normals: c.normals, uvs: c.uvs, colors: Float32Array.from(c.colors, toLinear), index: c.index, joints: c.joints, weights: c.weights,
                texture: 'creaturefur.png', cutout: true, alphaCutoff: 0.3, keepColors: true, doubleSided: true, roughness: r.kind==='cat'?.95:.8, envMapIntensity:r.kind==='cat'?.10:.55,kind: 'hair', noShade: true });
            textures['creaturefur.png'] = lockTexture();
        }
        // The coat's own strands: fine, sparse, lit as the skin under them is.
        if (r.kind!=='cat'&&cards.coat.length) {
            const c = strandCards(cards.coat, rng(seed + 23));
            parts.push({ name: 'Coat fur', positions: place(c.positions), normals: c.normals, uvs: c.uvs, colors: Float32Array.from(c.colors, toLinear), index: c.index, joints: c.joints, weights: c.weights,
                texture: 'creaturefur.png', cutout: true, alphaCutoff: 0.3, keepColors: true, doubleSided: true, roughness: r.kind==='cat'?.95:.8, envMapIntensity:r.kind==='cat'?.10:.85,kind: 'hair', onSkin: true, noShade: true });
            textures['creaturefur.png'] = lockTexture();
        }
        const scalePoint = p => [p[0] * S, (p[1] - minY) * S, p[2] * S];
        const outBones = bones.map(b => ({ name: b.name, parent: b.parent, head: scalePoint(b.head), tail: scalePoint(b.tail) }));
        let top = 0;
        for (const part of parts) for (let i = 1; i < part.positions.length; i += 3) top = Math.max(top, part.positions[i]);
        const markers = markersOf(lay, scalePoint);
        const result = { parts, bones: outBones, height: top, plan: 'quadruped', headOnly: !!o.headOnly, rig: { template: 'quadruped', markers }, clips: o.static ? [] : [idleClip(outBones, r)], textures, recipe: given };
        Object.defineProperty(result, 'whiskerLines', { value: whiskerLines, enumerable: false });
        if(o.headOnly){result.skullAnchor=scalePoint(lay.H(0,-.32,-.20));result.skullRadius=lay.sr*S;}
        if (o.diagnostics) result.attachments = {
            coreTriangles: bodyFaces / 3,
            tail: lay.tailAttachment ? { root: scalePoint(lay.tailAttachment.root), surface: scalePoint(lay.tailAttachment.surface) } : null,
            anatomy: (lay.anatomyRoots || []).map(q => ({ ...q, p: scalePoint(q.p) }))
        };
        return result;
    }

    /** The places strand cards grow, with their lie, length and color. */
    function furRoots(r, lay, coat, tags, normals, vcount, C, boneIndex, budget, save) {
        const roots = [];
        if (budget <= 0) return { roots, coat: [] };
        const rand = rng((r.seed % 997) + 101), seed = r.seed % 997;
        const { J, g, sr } = lay;
        const P = coat.positions, I = coat.index, CO = coat.colors;
        const lionMane = (r.mane === 'lion' || r.mane === 'ruff') && r.maneSize > 0;
        const fineCoat = FINE_PATTERNS.has(r.pattern) && r.patternAmount > 0.15;
        const shag = smooth(0.12, 0.9, r.fluff);
        const maneCap = Math.round((save ? 3600 : 1700) * budget * Math.min(1.5, r.maneSize));
        const coatCap = Math.round((save ? 3200 : 1500) * budget * shag);
        const at = v => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
        const skinOf = v => ({ joints: coat.joints.slice(v * 4, v * 4 + 4), weights: coat.weights.slice(v * 4, v * 4 + 4) });
        // Areas of the body's triangles by kind of root.
        const maneTris = [], coatTris = [], ruffTris = [];
        let maneArea = 0, coatArea = 0, ruffArea = 0;
        for (let t = 0; t < I.length; t += 3) {
            const a = I[t], b = I[t + 1], c = I[t + 2];
            if (a >= vcount || b >= vcount || c >= vcount) continue;
            const tag = tags[a];
            const pa = at(a), pb = at(b), pc = at(c);
            const area = 0.5 * len(cross(sub(pb, pa), sub(pc, pa)));
            // A tiger's cheek ruffs: the fur over the sides of the face below and behind the eyes.
            if (r.kind === 'tiger' && HEAD_TAGS.has(tag) && tag !== 'ear') { const q = sub(pa, J.skull), hz = dot(q, J.hdir) / sr, hy = dot(q, J.hup) / sr, hx = Math.abs(q[0]) / sr;
                if (hx > 0.45 && hy < 0.15 && hy > -0.75 && hz < 0.25 && hz > -0.95) { ruffArea += area; ruffTris.push([t, ruffArea]); } }
            if (tag === 'mane' && lionMane) { maneArea += area; maneTris.push([t, maneArea]); }
            else if (shag > 0 && !(tag === 'nosepad' || tag === 'hoof' || tag === 'pad' || tag === 'vulva' || tag === 'sheath' || tag === 'udder') && !(tag === 'mane')) {
                const n = [normals[a * 3], normals[a * 3 + 1], normals[a * 3 + 2]];
                // None on the soles or the face's front.
                if (n[1] < -0.8 && pa[1] < 0.1 * g) continue;
                if (HEAD_TAGS.has(tag) && dot(sub(pa, J.skull), J.hdir) / sr > (profileOf(r).face === 'sheep' ? -0.35 : 0.3)) continue;
                coatArea += area; coatTris.push([t, coatArea]);
            }
        }
        const pick = (list, total) => {
            const x = rand() * total;
            let lo = 0, hi = list.length - 1;
            while (lo < hi) { const m = (lo + hi) >> 1; if (list[m][1] < x) lo = m + 1; else hi = m; }
            const t = list[lo][0];
            let s1 = rand(), s2 = rand();
            if (s1 + s2 > 1) { s1 = 1 - s1; s2 = 1 - s2; }
            const a = I[t], b = I[t + 1], c = I[t + 2];
            const w = [1 - s1 - s2, s1, s2];
            const p = add(add(mul(at(a), w[0]), mul(at(b), w[1])), mul(at(c), w[2]));
            const n = norm(add(add(mul([normals[a * 3], normals[a * 3 + 1], normals[a * 3 + 2]], w[0]), mul([normals[b * 3], normals[b * 3 + 1], normals[b * 3 + 2]], w[1])), mul([normals[c * 3], normals[c * 3 + 1], normals[c * 3 + 2]], w[2])));
            const main = w[0] > w[1] && w[0] > w[2] ? a : w[1] > w[2] ? b : c;
            return { p, n, v: main };
        };
        if (maneTris.length && maneCap > 0) {
            const mane = C.mane, fair = mixRgb(C.mane, C.light, 0.5), dark = mixRgb(C.mane, [0.05, 0.03, 0.02], 0.45);
            const ms = r.maneSize;
            for (let i = 0; i < maneCap; i++) {
                const { p, n, v } = pick(maneTris, maneArea);
                const rel = sub(p, J.skull), hz = dot(rel, J.hdir) / sr + (r.mane === 'ruff' ? -1.5 : 0);

                // Locks lie back from the face and down the neck, falling over the chest.
                const fromFace = smooth(-0.4, -1.6, hz);
                // Round the face the locks lie out from it and back, short; down the neck and chest they hang long.
                const radial = norm(sub(rel, mul(J.hdir, dot(rel, J.hdir))));
                const flow = hz > -0.6 ? norm(add(mul(radial, 0.8), mul(J.hdir, -0.6))) : norm(add(mul(J.hdir, -1), [0, -0.6 - 0.6 * fromFace, 0]));
                const fringe = smooth(-1.4, -0.2, hz);
                const color = mixRgb(mixRgb(dark, mane, 0.3 + 0.7 * rand()), fair, fringe * 0.7);
                roots.push(Object.assign({ p, n, flow, len: (0.07 + 0.1 * rand()) * (0.55 + 0.45 * ms) * g * (0.35 + 0.85 * fromFace), width: (r.kind==='cat'?.0035:.018) * g * (0.8 + 0.4 * rand()), lift: 0.15 + 0.25 * rand(), droop: 0.45,
                    color, tipColor: mixRgb(color, fair, 0.35) }, skinOf(v)));
            }
        }
        if (ruffTris.length) {
            // Short pale side-whiskers of fur sweeping back and down off the cheeks (a tiger has no neck mane).
            const fair = mixRgb(C.light, [1, 1, 1], 0.2), count = Math.round((save ? 700 : 320) * budget);
            for (let i = 0; i < count; i++) {
                const { p, n, v } = pick(ruffTris, ruffArea), q = sub(p, J.skull), hz = dot(q, J.hdir) / sr;
                const flow = norm(add(add(mul(n, 0.55), mul(J.hdir, -0.7)), mul(J.hup, -0.25)));
                const color = mixRgb(fair, C.coat, smooth(0.0, -0.8, hz) * 0.5 * rand());
                roots.push(Object.assign({ p, n, flow, len: (0.035 + 0.035 * rand()) * g * (0.6 + 0.6 * smooth(0.2, -0.6, hz)), width: 0.006 * g * (0.8 + 0.4 * rand()), lift: 0.35, droop: 0.25, color, tipColor: fair }, skinOf(v)));
            }
        }
        if (r.mane === 'horse' && r.maneSize > 0 && maneCap > 0) {
            // A crest mane: long hair along the top of the neck from poll to withers, falling to one side
            // (a boar's: a short bristly ridge standing up along its back).
            const crest = [];
            for (let v = 0; v < vcount; v++) {
                const tag = tags[v], pv = at(v);
                if (!(tag === 'neck' || tag === 'mane' || (tag === 'back' && r.kind === 'boar') || tag === 'skull' && dot(sub(pv, J.skull), J.hdir) < -0.45 * sr)) continue;
                if (Math.abs(pv[0]) > 0.035 * g || normals[v * 3 + 1] < 0.25 || pv[2] < J.withers[2] - (r.kind === 'boar' ? 0.35 * g : 0.02 * g)) continue;
                crest.push(v);
            }
            const boar = r.kind === 'boar', ms = Math.min(1.6, r.maneSize), mane = C.mane, fair = mixRgb(C.mane, C.light, 0.35), dark = mixRgb(C.mane, [0.02, 0.015, 0.01], 0.5);
            const count = crest.length ? Math.round((save ? 900 : 600) * budget * Math.min(1.3, r.maneSize)) : 0;
            for (let i = 0; i < count; i++) {
                const v = crest[Math.floor(rand() * crest.length)], pv = at(v), n = [normals[v * 3], normals[v * 3 + 1], normals[v * 3 + 2]];
                const color = mixRgb(mane, dark, rand() * 0.6), side = rand() < 0.85 ? -1 : 1;
                const flow = boar ? norm([(rand() - 0.5) * 0.5, 0.9, -0.5]) : norm([side * (0.55 + 0.3 * rand()), -0.75, -0.3 + 0.2 * rand()]);
                roots.push(Object.assign({ p: add(pv, [(rand() - 0.5) * 0.02 * g, 0, 0]), n, flow, len: (boar ? 0.05 + 0.05 * rand() : 0.12 + 0.12 * rand()) * ms * g, width: (boar ? 0.012 : 0.026) * g * (0.8 + 0.4 * rand()), lift: boar ? 0.6 : 0.25 + 0.2 * rand(), droop: boar ? 0.05 : 0.65,
                    color, tipColor: mixRgb(color, fair, 0.15) }, skinOf(v)));
            }
        }
        if (lay.tuft && r.tail === 'tufted') {
            // The tail's tuft: strands out of its core, combed toward the tip.
            const tuftColor = mixRgb(C.mane, C.marking, 0.5);
            const t3 = boneIndex.get('Tail3');
            const count = Math.round((save ? 120 : 70) * Math.max(0.5, budget));
            const { from, to, dir } = lay.tuft;
            for (let i = 0; i < count; i++) {
                const t = rand();
                const a = rand() * Math.PI * 2;
                let side = norm(cross(dir, [0, 1, 0]));
                if (!len(side)) side = [1, 0, 0];
                const up = norm(cross(side, dir));
                const n = norm(add(mul(side, Math.cos(a)), mul(up, Math.sin(a))));
                const p = add(lerp(from, to, t), mul(n, lay.tuft.r * 0.6 * Math.sin(Math.PI * clamp(t, 0.1, 0.9))));
                roots.push({ p, n, flow: dir, len: lay.tuft.r * (1.8 + 1.6 * rand()), width: lay.tuft.r * 0.5, lift: 0.25, droop: 0.1, color: tuftColor, tipColor: mixRgb(tuftColor, C.marking, 0.3), joints: [t3, 0, 0, 0], weights: [1, 0, 0, 0] });
            }
        }
        if (lay.forelock) {
            // The forelock's hairs: strands out of its core, combed down its length and spread across it.
            const { pts, width } = lay.forelock, head = boneIndex.get('Head');
            const count = Math.round((save ? 110 : 60) * Math.max(0.5, budget));
            for (let i = 0; i < count; i++) {
                const u = rand() * 0.8, k = Math.min(pts.length - 2, Math.floor(u * (pts.length - 1)));
                const dir = norm(sub(pts[k + 1], pts[k])), across = (rand() * 2 - 1) * width(u);
                const p = add(lerp(pts[k], pts[k + 1], u * (pts.length - 1) - k), [across, 0, 0]);
                roots.push({ p, n: J.hup, flow: norm(add(dir, [across / sr * 0.6, 0, 0])), len: sr * (0.25 + 0.25 * rand()) * Math.min(1.6, r.maneSize), width: 0.05 * sr, lift: 0.05, droop: 0.35,
                    color: mixRgb(C.mane, [0, 0, 0], 0.15 * rand()), tipColor: mixRgb(C.mane, C.coat, 0.15), joints: [head, 0, 0, 0], weights: [1, 0, 0, 0] });
            }
        }
        const coat2 = [];
        if (coatTris.length && coatCap > 0) {
            // Fine strands lying close along the hair's flow; a fleece's wool is in the surface, its strands few.
            const wool = profileOf(r).face === 'sheep' ? 0.3 : 1;
            const density = 1500 * r.fluff * budget * (save ? 1 : 0.55) * wool;
            const count = Math.min(Math.round(coatCap * 1.05 * wool), Math.round(coatArea * density));
            for (let i = 0; i < count; i++) {
                const { p, n, v } = pick(coatTris, coatArea);
                const tag = tags[v];
                // The hair's lie: from the nose back over the head and out over the cheeks, down and back along the neck,
                // back along the body and down its sides, down the legs (and back down their rear edges).
                const onLeg = LEG_TAGS.has(tag), onHead = HEAD_TAGS.has(tag);
                let flow = onLeg ? [0, -1, -0.15] : onHead ? add(mul(J.hdir, -1), [Math.sign(p[0]) * 0.35, -0.1, 0]) : tag === 'neck' || tag === 'mane' ? add(mul(norm(sub(J.atlas, J.neck)), -1), [0, -0.3, 0]) : [0, -0.45, -1];
                // Clumps: neighbouring hairs share a slight turn, so they part into locks.
                const cf = 34 / g, clump = [valueNoise(p[0] * cf, p[1] * cf, p[2] * cf, seed + 41), valueNoise(p[0] * cf, p[1] * cf, p[2] * cf, seed + 43), valueNoise(p[0] * cf, p[1] * cf, p[2] * cf, seed + 47)];
                flow = norm(add(norm(flow), mul(clump, 0.35)));
                // Length by region: short on the face and lower legs, longer on the neck's ruff, the belly, the backs of the legs.
                const region = onHead ? 0.45 : LOW_LEG_TAGS.has(tag) ? (n[2] < -0.3 ? 0.8 : 0.45) : onLeg ? (n[2] < -0.3 ? 1.35 : 0.7) : tag === 'neck' || tag === 'mane' ? 1.4 : n[1] < -0.5 ? 1.3 : 1;
                // Guard hairs: a few longer, finer, their tips banded.
                const guard = rand() < 0.12;
                // A fine pattern is finer than the vertices: the hair takes the coat at its own root.
                const color = fineCoat ? coatColor(r, lay, p, n, tag, C) : [CO[v * 3], CO[v * 3 + 1], CO[v * 3 + 2]];
                const shade = 0.9 + 0.2 * rand();
                coat2.push(Object.assign({ p, n, flow, len: (0.02 + 0.035 * r.fluff) * g * (0.7 + 0.6 * rand())*(r.kind==='cat'&&r.fluff>.6?1.2:1) * region * (guard ? 1.45 : 1), width: (r.kind==='cat'?.0015:.007) * g * (0.8 + 0.4 * rand()) * (guard ? 0.6 : 1), lift: 0.12 + 0.18 * rand(), droop: 0.25,
                    color: mul(color, shade), tipColor: guard ? mixRgb(mul(color, shade), rand() < 0.5 ? C.marking : C.light, 0.45) : mixRgb(mul(color, shade), C.light, 0.12), lane: rand() < 0.5 ? 0 : 1, v0: 0.2 }, skinOf(v)));
            }
        }
        if (r.tail === 'horse' && J.tail.length > 1) {
            // A hair tail: long strands from the dock, falling and spreading to the hocks.
            const path = curve(J.tail, 18), count = Math.round((save ? 600 : 400) * Math.max(0.4, budget)), names = ['Tail', 'Tail2', 'Tail3'];
            for (let i = 0; i < count; i++) {
                const t = Math.pow(rand(), 1.6) * 0.75, k = Math.min(path.length - 2, Math.floor(t * (path.length - 1))), center = lerp(path[k], path[k + 1], t * (path.length - 1) - k), dir = norm(sub(path[k + 1], path[k]));
                const a = rand() * Math.PI * 2, n = norm([Math.cos(a), Math.sin(a) * 0.5, Math.sin(a) * 0.5]);
                const u = clamp(t * 3 - 0.5, 0, 2), j = Math.floor(u), w = u - j;
                const skin = t < 0.15 ? { joints: [boneIndex.get('Hips'), boneIndex.get('Tail'), 0, 0], weights: [1 - t / 0.15, t / 0.15, 0, 0] } : { joints: [boneIndex.get(names[j]), boneIndex.get(names[Math.min(2, j + 1)]), 0, 0], weights: [1 - w, w, 0, 0] };
                const color = mixRgb(C.mane, [0.02, 0.015, 0.01], 0.3 * rand());
                roots.push({ p: add(center, mul(n, 0.02 * g * r.tailThickness)), n, flow: norm(add(mul(dir, 0.35), [n[0] * 0.25, -1, -0.15])), len: (0.25 + 0.25 * rand()) * g * r.tailLength * (1 - 0.6 * t), width: 0.03 * g, color, tipColor: mixRgb(color, C.mane, 0.3), lift: 0.05, droop: 0.2, ...skin });
            }
        }
        if(r.kind==='cat'&&r.tail==='bushy'){
            const path=curve(J.tail,18),count=Math.round((save?800:420)*budget),names=['Tail','Tail2','Tail3'];
            path.forEach((p,i)=>{const t=i/(path.length-1),radius=(.03+.05*Math.sin(Math.PI*Math.min(1,t*1.05))*(1-.25*t))*r.tailThickness*g;p[1]=Math.max(p[1],radius+.003*g);});
            for(let i=0;i<count;i++){
                const t=.025+rand()*.94,k=Math.min(path.length-2,Math.floor(t*(path.length-1))),center=lerp(path[k],path[k+1],t*(path.length-1)-k),dir=norm(sub(path[k+1],path[k]));
                const across=norm(cross(dir,[1,0,0])),up=cross(dir,across),a=rand()*Math.PI*2,n=add(mul(across,Math.cos(a)),mul(up,Math.sin(a)));
                const radius=(.03+.05*Math.sin(Math.PI*Math.min(1,t*1.05))*(1-.25*t))*r.tailThickness*g;
                const u=clamp(t*3-.5,0,2),j=Math.floor(u),w=u-j,bone=boneIndex.get(names[j]),next=boneIndex.get(names[Math.min(2,j+1)]);
                const color=r.pattern==='points'?C.marking:C.coat;
                const skin=t<.15?{joints:[boneIndex.get('Hips'),boneIndex.get('Tail'),0,0],weights:[1-t/.15,t/.15,0,0]}:{joints:[bone,next,0,0],weights:[1-w,w,0,0]};
                roots.push({p:add(center,mul(n,radius*.97)),n,flow:dir,len:(.045+.045*rand())*g,width:.002*g,color,tipColor:mixRgb(color,C.light,.08),lift:.35,droop:.15,...skin});
            }
        }
        return { roots, coat: coat2 };
    }

    /** Teats in pairs along the belly's two rows, or on an udder, each a short round-ended cone set on the skin. */
    function teatsOf(r, lay, net, coat, boneIndex, C) {
        const t = profileOf(r).teats;
        if (r.anatomy.teats <= 0 || (t.udder && r.anatomy.udder <= 0)) return;
        const { J, g, zS, zH, yH } = lay;
        const spots = [];
        if (t.udder) {
            const u = t.udder;
            const c = lay.udder || [0, yH - 0.08 * g - 0.04 * u * g, zH + 0.08];
            const n = t.count;
            for (let i = 0; i < n; i++) {
                const x = (n === 2 ? (i ? 1 : -1) * 0.03 : ((i % 2) ? 1 : -1) * 0.045) * g * (0.6 + 0.4 * u);
                const z = c[2] + (n === 2 ? 0.0 : (i < 2 ? 0.045 : -0.045)) * (0.6 + 0.4 * u);
                spots.push({ x, z, len: (0.035 + 0.03 * u) * g, rad: (0.009 + 0.006 * u) * g, bone: 'Hips' });
            }
        } else {
            for (let i = 0; i < t.pairs; i++) {
                const f = t.pairs === 1 ? 0.5 : t.from + (t.to - t.from) * i / (t.pairs - 1);
                const z = lerp([0, 0, zS - 0.05], [0, 0, zH + 0.2], f)[2];
                for (const s of [1, -1]) spots.push({ x: s * 0.05 * g, z, len: 0.016 * g, rad: 0.008 * g, bone: z > (zS + zH) / 2 ? 'Chest' : 'Spine' });
            }
        }
        const bone = name => boneIndex.get(name);
        for (const s of spots) {
            // Down from inside the belly to its surface.
            const found = surfaceBelow([...net.list, ...(lay.anatomyShapes || [])], [s.x, J.hip[1], s.z], g);
            s.len *= r.anatomy.teats; s.rad *= Math.sqrt(r.anatomy.teats);
            const tip = add(found, [s.x * 0.15, -s.len, 0]);
            const mesh = loft(curve([add(found, [0, 0.004 * g, 0]), lerp(found, tip, 0.5), tip], 5), tt => { const v = s.rad * (1 - 0.35 * tt); return [v, v]; }, 8, null, false);
            const base = coat.positions.length / 3;
            const col = mixRgb(C.nose, [0.8, 0.55, 0.52], 0.45);
            for (let i = 0; i < mesh.positions.length / 3; i++) {
                coat.positions.push(mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]);
                const c = mixRgb(mixRgb(C.light, col, 0.5), col, mesh.t[i]);
                coat.colors.push(c[0], c[1], c[2]);
                coat.joints.push(bone(s.bone), 0, 0, 0); coat.weights.push(1, 0, 0, 0);
            }
            for (const q of mesh.index) coat.index.push(q + base);
        }
    }

    /** The top four bone influences of a vertex, normalized. */
    function setSkin(joints, weights, v, byBone) {
        const top = [...byBone.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
        const total = top.reduce((s, [, w]) => s + w, 0) || 1;
        for (let k = 0; k < 4; k++) {
            joints[v * 4 + k] = top[k] ? top[k][0] : 0;
            weights[v * 4 + k] = top[k] ? top[k][1] / total : 0;
        }
    }

    /** The Rig tool's quadruped markers, from the joints. */
    function markersOf(lay, at) {
        const { J } = lay;
        // The template puts the head bone 70% of the way from the neck marker to the head marker.
        const head = add(J.neck, mul(sub(J.atlas, J.neck), 1 / 0.7));
        const m = {
            head: at(head), neck: at(J.neck), hips: at(J.hips),
            tailTip: at(J.tail.length > 1 ? J.tail[J.tail.length - 1] : add(J.hips, [0, 0, -0.2]))
        };
        for (const [side, f] of [['L', same], ['R', mirror]]) {
            m['frontLeg' + side] = at(f(J.shoulder)); m['frontKnee' + side] = at(f(J.frontKnee)); m['frontAnkle' + side] = at(f(J.frontAnkle));
            m['rearLeg' + side] = at(f(J.hip)); m['rearKnee' + side] = at(f(J.rearKnee)); m['rearAnkle' + side] = at(f(J.rearAnkle));
        }
        return m;
    }

    // ── idle ───────────────────────────────────────────────────────────────
    const axisAngle = (x, y, z, a) => { const s = Math.sin(a / 2); return [x * s, y * s, z * s, Math.cos(a / 2)]; };
    /** Breathing, a tail that swings, a head that looks about: three seconds round. */
    function idleClip(bones, recipe) {
        const steps = 25, period = 3;
        const times = [];
        for (let i = 0; i < steps; i++) times.push((period * i) / (steps - 1));
        const tracks = [];
        const track = (name, at) => {
            const bone = bones.findIndex(b => b.name === name);
            if (bone < 0) return;
            const values = [];
            for (let i = 0; i < steps; i++) values.push(...at((2 * Math.PI * i) / (steps - 1)));
            tracks.push({ bone, values });
        };
        track('Chest', a => axisAngle(1, 0, 0, 0.012 * Math.sin(a * 2)));
        track('Spine', a => axisAngle(1, 0, 0, -0.008 * Math.sin(a * 2)));
        track('Neck', a => axisAngle(1, 0, 0, 0.03 * Math.sin(a)));
        track('Head', a => axisAngle(0, 1, 0, 0.12 * Math.sin(a)));
        track('LeftWing', a => axisAngle(0, 0, 1, 0.06 * Math.sin(a)));
        track('RightWing', a => axisAngle(0, 0, 1, -0.06 * Math.sin(a)));
        // (An armadillo's tail sways only past its hip shield's rim, see poseClip.)
        const shielded = recipe && recipe.kind === 'armadillo' ? 1 : 0;
        track('Tail', a => axisAngle(0, 1, 0, 0.22 * (1 - shielded) * Math.sin(a * 2)));
        track('Tail2', a => axisAngle(0, 1, 0, 0.25 * (1 - shielded) * Math.sin(a * 2 - 0.6)));
        track('Tail3', a => axisAngle(0, 1, 0, (0.3 + 0.2 * shielded) * Math.sin(a * 2 - 1.2)));
        return { name: 'Idle', times, tracks };
    }

    /**
     * The model.json beside the saved GLB: a quadruped rig whose bones are the
     * file's own (the runtime maps each onto the file joint of its name and
     * place, mapRigToSkeleton), so no weights file is needed.
     */
    function sidecar(built) {
        if (built.form) return Forms.sidecar(built);
        const names = new Set(['Hips', 'Spine', 'Chest', 'Neck', 'Head', 'Tail']);
        for (const side of ['Left', 'Right']) for (const part of ['FrontUpperLeg', 'FrontLowerLeg', 'FrontFoot', 'RearUpperLeg', 'RearLowerLeg', 'RearFoot']) names.add(side + part);
        const kept = built.bones.map((b, i) => [b, i]).filter(([b]) => names.has(b.name));
        const remap = new Map(kept.map(([, i], k) => [i, k]));
        // A kept bone's parent is its nearest kept ancestor.
        const parentOf = i => { let p = built.bones[i].parent; while (p >= 0 && !remap.has(p)) p = built.bones[p].parent; return p >= 0 ? remap.get(p) : -1; };
        return {
            rig: {
                template: 'quadruped',
                markers: built.rig.markers,
                bones: kept.map(([b, i]) => ({ name: b.name, parent: parentOf(i), head: b.head.slice(), tail: b.tail.slice() }))
            }
        };
    }


    // ── poses ──────────────────────────────────────────────────────────────
    /** Poses and gaits to try a creature in, in the panel's order. */
    const POSES = [
        { id: 'walk', label: 'Walking' }, { id: 'trot', label: 'Trotting' }, { id: 'gallop', label: 'Galloping' }, { id: 'stalk', label: 'Stalking' },
        { id: 'pounce', label: 'Pouncing' }, { id: 'sit', label: 'Sitting' }, { id: 'lieDown', label: 'Lying down' }, { id: 'lieSide', label: 'Lying on the side' },
        { id: 'rear', label: 'Rearing up' }, { id: 'playBow', label: 'Play bow' }
    ];
    const posesFor = r => !r?.morphology || r.morphology === 'quadruped' ? POSES : Forms.POSES.filter(p => ['turn', 'attack', ...(r.morphology === 'avian' && r.birdType === 'penguin' ? ['crawl','swim','glide'] : ['avian','bat'].includes(r.morphology) || ['bee','wasp','mosquito','fly','butterfly','dragonfly'].includes(r.kind) ? ['crawl','fly','glide'] : r.morphology === 'arthropod' || r.morphology === 'worm' || r.morphology === 'reptile' ? ['crawl'] : ['swim', 'glide'])].includes(p.id));

    const qAxis = (x, y, z, a) => { const sn = Math.sin(a / 2); return [x * sn, y * sn, z * sn, Math.cos(a / 2)]; };
    const qMul = (a, b) => [
        a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
        a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
        a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
    ];
    const qRot = (q, v) => {
        const [x, y, z, w] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
        return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
    };
    /** A joint's turn: pitch about x (positive swings a limb's end back, a head's nose down), then yaw about y, then roll about z. */
    const qTurn = (x = 0, y = 0, z = 0) => qMul(qAxis(0, 0, 1, z), qMul(qAxis(0, 1, 0, y), qAxis(1, 0, 0, x)));
    const TAU = Math.PI * 2;
    const wrap01 = x => ((x % 1) + 1) % 1;
    const easeIO = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
    const LEGS = [['LeftFront', true, 1], ['RightFront', true, -1], ['LeftRear', false, 1], ['RightRear', false, -1]];

    /**
     * A pose's clip for a creature's bones (as `build` returns them, meters):
     * { name, times, tracks: [{ bone, values }], heights, lift(t), skin } in
     * the RRCharacterPoses format, each track one local quaternion a time
     * relative to the unrotated rest; or null where the pose does not suit
     * the creature (rearing for a cat, a play bow on hooves).
     */
    function poseClip(bones, id, recipe) {
        if (bones[0]?.birdFrame && Flyers?.poseClip) return Flyers.poseClip(bones, id, recipe);
        if ((recipe?.morphology && recipe.morphology !== 'quadruped') || bones[0]?.creatureForm) return Forms.poseClip(bones, id, recipe);
        if (!POSES.some(p => p.id === id)) return null;
        const at = new Map(bones.map((b, i) => [b.name, i]));
        for (const name of ['Hips', 'Chest', 'Head', 'LeftFrontUpperLeg', 'LeftRearFoot']) if (!at.has(name)) return null;
        const B = name => bones[at.get(name)];
        const r = recipe ? normalizeRecipe(recipe) : null;
        const hoofed = !!r && r.feet === 'hoof';
        const plant = r ? r.plantigrade : 0;
        if (id === 'rear' && r && !(r.feet === 'hoof' || plant > 0.5 || r.wings !== 'none')) return null;
        if (id === 'playBow' && r && r.feet === 'hoof') return null;
        const legH = B('LeftFrontUpperLeg').head[1];
        const D = Math.abs(B('LeftFrontUpperLeg').head[2] - B('LeftRearUpperLeg').head[2]) || legH;
        // Each bone's rest pitch: its forward angle from straight down.
        const restAngle = name => { const b = B(name); const d = sub(b.tail, b.head); return Math.atan2(d[2], -d[1]); };
        const gaitDef = { walk: { duty: 0.64, phases: { LeftRear: 0, LeftFront: 0.25, RightRear: 0.5, RightFront: 0.75 }, period: 1.1, front: 0.3, rear: 0.3, lift: 0.5 },
            trot: { duty: 0.45, phases: { LeftFront: 0, RightRear: 0, RightFront: 0.5, LeftRear: 0.5 }, period: 0.62, front: 0.42, rear: 0.4, lift: 0.75 },
            gallop: { duty: 0.3, phases: { LeftRear: 0, RightRear: 0.1, RightFront: 0.4, LeftFront: 0.52 }, period: 0.48, front: 0.75, rear: 0.7, lift: 1 } };
        const scaleT = Math.sqrt(Math.max(0.05, legH) / 0.75);
        const steps = gaitDef[id] ? 41 : id === 'pounce' ? 49 : 25;
        const period = gaitDef[id] ? gaitDef[id].period * scaleT : id === 'pounce' ? 1.6 * scaleT : 3;
        /** Locals for a leg from the forward angles (radians from straight down) wanted for its three bones, its parent pitched by `tilt`. */
        const chain = (leg, targets, out, tilt = 0) => {
            let parent = 0;
            ['UpperLeg', 'LowerLeg', 'Foot'].forEach((part, k) => {
                const name = leg + part;
                if (!at.has(name)) return;
                const world = restAngle(name) - (targets[k] + tilt);
                out[name] = [world - parent, 0, 0];
                parent = world;
            });
        };
        const frames = [];
        const flight = new Float32Array(steps);
        for (let f = 0; f < steps; f++) {
            const t = f / (steps - 1);
            const P = {};
            const set = (name, x = 0, y = 0, z = 0) => { if (at.has(name)) P[name] = [x, y, z]; };
            if (gaitDef[id]) {
                const G = gaitDef[id];
                for (const [leg, front] of LEGS) {
                    const ph = wrap01(t - G.phases[leg]);
                    // The protraction: forward at touchdown, back at lift-off; the swing lifts and folds the leg.
                    const stance = ph < G.duty;
                    const pr = stance ? 1 - 2 * ph / G.duty : -1 + 2 * easeIO((ph - G.duty) / (1 - G.duty));
                    const swing = stance ? 0 : Math.sin(Math.PI * (ph - G.duty) / (1 - G.duty));
                    const amp = front ? G.front : G.rear;
                    if (front) {
                        set(leg + 'UpperLeg', -amp * pr * 0.75 + 0.25 * swing * G.lift, 0, 0);
                        set(leg + 'LowerLeg', 0.55 * swing * G.lift - amp * pr * 0.25, 0, 0);
                        set(leg + 'Foot', 1.1 * swing * G.lift, 0, 0);
                    } else {
                        set(leg + 'UpperLeg', -amp * pr - 0.35 * swing * G.lift, 0, 0);
                        set(leg + 'LowerLeg', 0.6 * swing * G.lift, 0, 0);
                        set(leg + 'Foot', -0.55 * swing * G.lift + (stance ? -0.15 * (1 - pr) * 0.5 : 0), 0, 0);
                    }
                }
                const w = TAU * t;
                if (id === 'walk') {
                    // The head nods twice a stride; the hips roll and the tail swings with the hind legs.
                    // A short-legged armadillo waddles: its whole body rolls side to side with each step.
                    const waddle = recipe?.kind === 'armadillo' ? 3.2 : 1;
                    set('Hips', 0, 0.04 * Math.sin(w), 0.03 * waddle * Math.sin(w));
                    set('Spine', 0, -0.03 * Math.sin(w), 0);
                    set('Chest', 0, -0.03 * Math.sin(w), -0.02 * waddle * Math.sin(w + 1.6));
                    set('Neck', 0.06 * Math.sin(2 * w + 0.6), 0.03 * Math.sin(w), 0);
                    set('Head', -0.04 * Math.sin(2 * w + 0.6), 0.02 * Math.sin(w), 0);
                    set('Tail', 0.05, 0.16 * Math.sin(w - 0.6), 0); set('Tail2', 0.04, 0.2 * Math.sin(w - 1.2), 0); set('Tail3', 0, 0.24 * Math.sin(w - 1.8), 0);
                } else if (id === 'trot') {
                    set('Hips', 0.03 * Math.sin(2 * w), 0, 0.02 * Math.sin(w));
                    set('Neck', 0.04 * Math.sin(2 * w + 1), 0, 0);
                    set('Tail', -0.15, 0.1 * Math.sin(w), 0); set('Tail2', 0.05, 0.12 * Math.sin(w - 0.8), 0); set('Tail3', 0.05, 0.14 * Math.sin(w - 1.6), 0);
                } else {
                    // The spine gathers as the hind legs reach under and stretches as they drive; the head and tail balance it.
                    const flex = Math.sin(w - 0.6);
                    set('Hips', 0.12 * flex, 0, 0);
                    set('Spine', -0.18 * flex, 0, 0);
                    set('Chest', -0.12 * flex, 0, 0);
                    set('Neck', 0.18 * flex + 0.1, 0, 0);
                    set('Head', -0.08 * flex, 0, 0);
                    set('Tail', -0.25 - 0.2 * flex, 0, 0); set('Tail2', 0.15 * flex, 0, 0); set('Tail3', 0.2 * flex, 0, 0);
                    // Two moments of flight a stride: gathered after the front feet, stretched after the hind.
                    flight[f] = 0.06 * legH * Math.max(0, Math.sin(TAU * (t - 0.62) / 0.38 * 0.5)) * (wrap01(t - 0.62) < 0.38 ? 1 : 0);
                }
            } else {
                const br = 0.01 * Math.sin(TAU * t * 2);
                const tailSwish = (a, b) => { set('Tail', a, b * Math.sin(TAU * t), 0); set('Tail2', a * 0.5, b * 1.3 * Math.sin(TAU * t - 0.8), 0); set('Tail3', a * 0.3, b * 1.6 * Math.sin(TAU * t - 1.6), 0); };
                let pitch = 0, roll = 0;
                if (id === 'sit') {
                    pitch = -0.8;
                    set('Spine', -0.05); set('Chest', -0.05 + br);
                    for (const leg of ['LeftFront', 'RightFront']) chain(leg, [-0.05, 0, 0], P, pitch - 0.1);
                    for (const leg of ['LeftRear', 'RightRear']) chain(leg, [1.35, -0.9, 1.5], P, pitch);
                    set('Neck', 0.45); set('Head', 0.3);
                    tailSwish(1.1, 0.06);
                } else if (id === 'lieDown') {
                    for (const leg of ['LeftFront', 'RightFront']) chain(leg, [-0.95, 1.5, 1.57], P);
                    for (const leg of ['LeftRear', 'RightRear']) chain(leg, [1.3, -1.7, 1.5], P);
                    set('Chest', br); set('Neck', -0.15); set('Head', 0.2, 0.15 * Math.sin(TAU * t), 0);
                    tailSwish(0.4, 0.08);
                } else if (id === 'lieSide') {
                    roll = Math.PI / 2;
                    chain('LeftFront', [0.35, 0.15, 0.3], P); chain('RightFront', [0.45, 0.25, 0.35], P);
                    chain('LeftRear', [0.55, -0.25, 0.4], P); chain('RightRear', [0.65, -0.15, 0.45], P);
                    set('Chest', br); set('Neck', -0.2, 0, 0); set('Head', -0.2, 0, 0.15);
                    tailSwish(0.15, 0.05);
                } else if (id === 'stalk') {
                    // Low and level, the head forward under the line of the back, a slow creep of the tail's tip.
                    pitch = 0.04;
                    chain('LeftFront', [-0.75, 0.5, 0.25], P, pitch); chain('RightFront', [-0.6, 0.45, 0.2], P, pitch);
                    chain('LeftRear', [0.9, -1.2, 0.5], P, pitch); chain('RightRear', [0.85, -1.15, 0.45], P, pitch);
                    set('Neck', 0.25); set('Head', -0.2);
                    set('Tail', 0.35, 0, 0); set('Tail2', 0.1, 0, 0); set('Tail3', -0.3, 0.25 * Math.sin(TAU * t * 2), 0);
                } else if (id === 'rear') {
                    // Up on the hind legs, the forelegs folded (a horse) or reaching (a bear).
                    const u = 0.5 + 0.5 * Math.sin(TAU * t - Math.PI / 2);
                    pitch = -0.95 - 0.08 * u;
                    for (const leg of ['LeftRear', 'RightRear']) chain(leg, [0.3, -0.45, 0.4], P, pitch);
                    if (hoofed) for (const leg of ['LeftFront', 'RightFront']) chain(leg, [1.5 - 0.3 * u, -0.2, -1.0], P, pitch);
                    else for (const leg of ['LeftFront', 'RightFront']) chain(leg, [2.0 - 0.2 * u, 2.1, 2.2], P, pitch);
                    set('Neck', 0.55); set('Head', 0.35 - 0.1 * u);
                    tailSwish(0.5, 0.1);
                } else if (id === 'playBow') {
                    // Elbows down and forelegs flat, the rump high, the tail up and wagging.
                    pitch = 0.42;
                    for (const leg of ['LeftFront', 'RightFront']) chain(leg, [-1.0, 1.45, 1.57], P, pitch);
                    for (const leg of ['LeftRear', 'RightRear']) chain(leg, [0.15, -0.35, 0.05], P, pitch);
                    set('Neck', -0.6); set('Head', -0.15, 0.1 * Math.sin(TAU * t * 2), 0);
                    set('Tail', -0.9, 0.35 * Math.sin(TAU * t * 3), 0); set('Tail2', -0.2, 0.45 * Math.sin(TAU * t * 3 - 0.8), 0); set('Tail3', 0, 0.5 * Math.sin(TAU * t * 3 - 1.6), 0);
                } else if (id === 'pounce') {
                    // Crouch, spring, fly stretched out, land on the forefeet, gather again.
                    const k = t;
                    const crouch = 1 - easeIO(k / 0.3) + easeIO((k - 0.85) / 0.15);
                    const stretch = easeIO((k - 0.3) / 0.12) * (1 - easeIO((k - 0.62) / 0.15));
                    const land = easeIO((k - 0.62) / 0.1) * (1 - easeIO((k - 0.85) / 0.15));
                    pitch = -0.25 * stretch + 0.15 * land + 0.05 * crouch;
                    const fr = [-0.7 * crouch + 1.0 * stretch + 0.35 * land, 0.5 * crouch + 0.6 * stretch + 0.1 * land, 0.25 * crouch + 0.3 * stretch];
                    const hr = [0.85 * crouch - 0.9 * stretch + 0.5 * land, -1.25 * crouch - 0.2 * stretch - 0.9 * land, 0.55 * crouch - 0.9 * stretch + 0.4 * land];
                    for (const leg of ['LeftFront', 'RightFront']) chain(leg, fr, P, pitch);
                    for (const leg of ['LeftRear', 'RightRear']) chain(leg, hr, P, pitch);
                    set('Neck', 0.2 * crouch - 0.1 * stretch); set('Head', -0.15 * crouch + 0.1 * stretch);
                    set('Tail', 0.3 * crouch - 0.2 * stretch, 0, 0); set('Tail2', -0.1 * stretch, 0, 0); set('Tail3', 0.2 * crouch, 0, 0);
                    flight[f] = 0.45 * legH * Math.max(0, Math.sin(Math.PI * clamp((k - 0.36) / 0.32, 0, 1)));
                }
                const hips = qMul(qTurn(0, 0, roll), qTurn(pitch, 0, 0));
                P.__hips = hips;
            }
            // An armadillo's tail root lies under the rigid hip shield: it holds still there and all its motion
            // is taken past the shield's rim (on the last tail bone), so the tail never cuts through the shell.
            if (r && r.kind === 'armadillo' && (P.Tail || P.Tail2)) {
                const a = P.Tail || [0, 0, 0], b = P.Tail2 || [0, 0, 0], c = P.Tail3 || [0, 0, 0];
                P.Tail3 = [a[0] + b[0] + c[0], (a[1] + b[1] + c[1]) * 0.7, a[2] + b[2] + c[2]]; delete P.Tail; delete P.Tail2;
            }
            frames.push(P);
        }
        // Into quaternions.
        const qFrames = frames.map(P => {
            const out = {};
            for (const [name, v] of Object.entries(P)) if (name !== '__hips') out[name] = qTurn(v[0], v[1], v[2]);
            if (P.__hips) out.Hips = P.Hips ? qMul(P.__hips, out.Hips) : P.__hips;
            return out;
        });
        // Where the creature touches the floor in each frame: its feet, and for a lying or sitting pose its elbows, hocks, breastbone and seat.
        const hipJ = B('LeftRearUpperLeg').head, shJ = B('LeftFrontUpperLeg').head;
        const contacts = [];
        for (const [leg] of LEGS) {
            contacts.push([leg + 'Foot', B(leg + 'Foot').tail]);
            contacts.push([leg + 'Foot', B(leg + 'Foot').head]);
            if (at.has(leg + 'LowerLeg')) contacts.push([leg + 'LowerLeg', B(leg + 'LowerLeg').head]);
        }
        contacts.push(['Hips', [0, hipJ[1] * 0.75, hipJ[2] - 0.2 * D]], ['Chest', [0, shJ[1] * 0.7, shJ[2] + 0.02 * D]]);
        const heights = new Float32Array(steps);
        const fk = Q => {
            const rot = [], pos = [];
            bones.forEach((b, i) => {
                const q = Q[b.name] || [0, 0, 0, 1];
                if (b.parent < 0) { rot[i] = q; pos[i] = b.head.slice(); }
                else {
                    const pb = bones[b.parent], off = qRot(rot[b.parent], sub(b.head, pb.head));
                    pos[i] = add(pos[b.parent], off);
                    rot[i] = qMul(rot[b.parent], q);
                }
            });
            // The root turns about its own head.
            return (name, rest) => { const i = at.get(name); return add(pos[i], qRot(rot[i], sub(rest, bones[i].head))); };
        };
        qFrames.forEach((Q, f) => {
            const place = fk(Q);
            let low = Infinity;
            for (const [name, rest] of contacts) low = Math.min(low, place(name, rest)[1]);
            heights[f] = -low;
        });
        // A gait's weight rolls from foot to foot rather than jolting.
        if (gaitDef[id]) {
            let h = Array.from(heights);
            for (let pass = 0; pass < 2; pass++) h = h.map((v, i) => (h[(i - 1 + steps) % steps] + 2 * v + h[(i + 1) % steps]) / 4);
            h.forEach((v, i) => { heights[i] = v; });
        }
        for (let f = 0; f < steps; f++) heights[f] += flight[f];
        const times = Float32Array.from({ length: steps }, (_, i) => period * i / (steps - 1));
        const names = new Set(qFrames.flatMap(Q => Object.keys(Q)));
        const tracks = [];
        for (const name of names) {
            if (!at.has(name)) continue;
            const values = new Float32Array(steps * 4);
            qFrames.forEach((Q, i) => values.set(Q[name] || [0, 0, 0, 1], i * 4));
            tracks.push({ bone: at.get(name), values });
        }
        return {
            name: id, times, tracks, heights, skin: id === 'lieSide' || id === 'lieDown' || id === 'sit',
            lift: tm => {
                const x = ((tm % period) + period) % period / period * (steps - 1), i = Math.floor(x), k = x - i;
                return heights[i] + (heights[Math.min(steps - 1, i + 1)] - heights[i]) * k;
            }
        };
    }

    const api = { KINDS, HEAD_KINDS,CAT_BREEDS,variantsFor,withVariant, FORMS: Forms.FORMS, SLIDERS, slidersFor, OPTIONS, COLORS, SEXES, ANATOMY_SLIDERS, anatomySliders, POSES: POSES.concat(Forms.POSES), posesFor, DEFAULT_RECIPE, kindRecipe, normalizeRecipe, normalizeAnatomy, randomRecipe, build, sidecar, lockTexture, poseClip };
    root.RRCreatureBody = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
