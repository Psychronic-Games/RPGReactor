/**
 * RRHumanBody - the Character Builder's body: a recipe of slider values in,
 * shaped vertex positions, joint positions and fitted eyes out.
 *
 * The data is the human pack (data/human.json + human.bin, built from
 * MakeHuman's CC0 assets by build-scripts/build-human-pack.cjs). One base
 * mesh carries every body: each slider blends shape targets on it, so the
 * vertex layout, UVs and skin weights never change and anything fitted to
 * the base (the eyes now, clothes later) follows every slider.
 *
 * No DOM and no three.js here: the builder page and the node tests share it.
 */
(function(root) {
    'use strict';

    const AGES = ['child', 'young', 'old'];
    const LEVELS = ['min', 'average', 'max'];
    const ANCESTRY = ['african', 'asian', 'caucasian'];

    const Targets = root.RRHumanTargets || (typeof require === 'function' ? require('./HumanTargets.js') : null);
    /** Shape sliders from the shared catalog: paired ones -1..1, one-sided 0..1, either carried on to its `extreme`. */
    const SLIDERS = Targets.SLIDERS;
    const SHAPES = SLIDERS.map(s => s.key);
    const SLIDER_BY_KEY = new Map(SLIDERS.map(s => [s.key, s]));

    /**
     * The build sliders' ranges: natural, and how far Extreme carries them.
     * Past the natural range a target blend is extrapolated.
     */
    const MACRO_RANGES = {
        weight: { natural: [0, 1], extreme: [-1, 6] },
        muscle: { natural: [0, 1], extreme: [-0.3, 2.5] },
        height: { natural: [0, 1], extreme: [-0.6, 1.8] },
        cup: { natural: [0, 1], extreme: [-0.2, 6] },
        firmness: { natural: [0, 1], extreme: [-0.5, 1.5] },
        // 0 MakeHuman's average build, 1 its idealized one (face and body).
        proportions: { natural: [0, 1], extreme: [0, 1.6] }
    };

    const DEFAULT_RECIPE = Object.freeze({
        species: 'human',
        gender: 0.5,      // 0 female, 1 male
        age: 25,          // years, 11..90
        muscle: 0.5,
        weight: 0.5,
        height: 0.5,
        cup: 0.5,
        firmness: 0.75,
        proportions: 0.7,
        ancestry: Object.freeze({ african: 1 / 3, asian: 1 / 3, caucasian: 1 / 3 }),
        shapes: Object.freeze({}),
        headSize: 1,
        // Anatomy: detail on or off, the sex shown ('auto' follows Gender), the genitals' size.
        anatomy: Object.freeze({ detail: false, sex: 'auto', length: 0, girth: 0, testicles: 0, areola: 1, nipple: 1, nippleProjection: 1, areolaColor: '', fold: 1, mons: 1, labia: 1, innerLabia: 1, clitoris: 1, foreskin: 'circumcised', paired: false }),
        morph: Object.freeze({ snout: 0, muzzle: 0, flat: 0, earsAway: 0, earHoles: 0.6, toes: 1, eyeWide: 1, eyeTall: 1, eyeSocket: 0, cranialRidges: 0, cranialLobes: 0, earBowls: 0, foreheadSpoon: 0, facialRidges: 0, neckWebbing: 0, noseFolds: 0 }),
        skin: '#c69c7f'
    });

    /** Face morphs beyond the targets: a snout or muzzle (and how narrow), a face flattened for a beak, human ears tucked away. */
    const MORPHS = { snout: [0, 1.5], muzzle: [0, 1], flat: [0, 1], earsAway: [0, 1], earHoles: [0, 2], toes: [0.4, 3], eyeWide: [0.5, 2.5], eyeTall: [0.5, 2.5], eyeSocket: [0, 1.5], cranialRidges: [0, 3], cranialLobes: [0, 3], earBowls: [0, 2], foreheadSpoon: [0, 3], facialRidges: [0, 3], neckWebbing: [0, 3], noseFolds: [0, 3] };

    const MIN_AGE = 11, MAX_AGE = 90;

    /**
     * The world's peoples, for the Ancestry choice: each a blend of the three
     * ancestry targets, small face-shape offsets added under the recipe's own
     * sliders, and its range of skin tones (light to deep; the middle one is
     * set when the people is chosen, the randomizer picks within the range).
     * Mixed is the even blend with no offsets.
     */
    const PEOPLES = [
        { id: 'mixed', label: 'Mixed', mix: { african: 1 / 3, asian: 1 / 3, caucasian: 1 / 3 }, face: {}, tones: ['#f1d3bd', '#e5b897', '#c69c7f', '#a8795a', '#8a5a3c', '#5e3b26'] },
        { id: 'european', label: 'European', mix: { african: 0, asian: 0, caucasian: 1 }, face: { noseHump: 0.1, noseWidth: -0.1, browRidge: 0.1, eyeSize: -0.05 }, tones: ['#f3d6c4', '#ecc4a8', '#e2b291', '#d29f7c', '#bf8a66'] },
        { id: 'middleEastern', label: 'Middle Eastern and North African', mix: { african: 0.12, asian: 0.05, caucasian: 0.83 }, face: { noseHump: 0.5, noseLength: 0.2, noseTip: -0.15, browRidge: 0.3, browHeight: -0.2, eyeSize: 0.1, lowerLip: 0.1, jaw: 0.1 }, tones: ['#e8c09c', '#d9a982', '#c6956c', '#ad7d55', '#90623d'] },
        { id: 'subSaharan', label: 'Sub-Saharan African', mix: { african: 1, asian: 0, caucasian: 0 }, face: { noseWidth: 0.2, lowerLip: 0.15, upperLip: 0.1, cheekBones: 0.15 }, tones: ['#a8795a', '#8a5a3c', '#70472d', '#5e3b26', '#4a2c1c', '#3a2216'] },
        { id: 'southAsian', label: 'South Asian', mix: { african: 0.25, asian: 0.15, caucasian: 0.6 }, face: { eyeSize: 0.15, noseHump: 0.15, noseLength: 0.1, noseWidth: 0.1, lowerLip: 0.15, browHeight: -0.1, chin: -0.1 }, tones: ['#e0b48c', '#c99a70', '#ad7d55', '#8f603c', '#6e4529'] },
        { id: 'centralAsian', label: 'Central Asian', mix: { african: 0, asian: 0.55, caucasian: 0.45 }, face: { cheekBones: 0.45, headWidth: 0.25, noseHump: -0.1, eyeOpen: -0.1, jaw: 0.15 }, tones: ['#efcfb2', '#e3ba98', '#d4a47f', '#bd8c66'] },
        { id: 'eastAsian', label: 'East Asian', mix: { african: 0, asian: 0.95, caucasian: 0.05 }, face: { noseHump: -0.3, browRidge: -0.2, headWidth: 0.1, noseWidth: 0.05, chin: -0.05 }, tones: ['#f2d4ba', '#e8c19f', '#dcae88', '#c99a72'] },
        { id: 'southeastAsian', label: 'Southeast Asian', mix: { african: 0.1, asian: 0.82, caucasian: 0.08 }, face: { noseWidth: 0.45, noseHump: -0.5, noseLength: -0.2, noseTip: 0.25, lowerLip: 0.25, upperLip: 0.2, headHeight: -0.25, headRound: 0.3, eyeSize: 0.15, browRidge: -0.15, cheeks: 0.1 }, tones: ['#e6c09a', '#d2a67c', '#b98a60', '#9c6f48', '#7e5636'] },
        { id: 'nativeAmerican', label: 'Native American', mix: { african: 0.05, asian: 0.6, caucasian: 0.35 }, face: { cheekBones: 0.6, headWidth: 0.35, noseHump: 0.55, noseLength: 0.2, noseTip: -0.15, jaw: 0.3, browRidge: 0.2, browHeight: -0.1, eyeOpen: -0.2, eyeSize: -0.1, mouthWidth: 0.1, headSquare: 0.2 }, tones: ['#dcae86', '#c69468', '#ae7c52', '#93633e', '#7a4f31'] },
        { id: 'latinAmerican', label: 'Latin American', mix: { african: 0.15, asian: 0.3, caucasian: 0.55 }, face: { cheekBones: 0.2, noseHump: 0.15, noseWidth: 0.1, lowerLip: 0.1 }, tones: ['#ecc6a4', '#ddb08a', '#c99a72', '#b1825a', '#93663f', '#6e4a2e'] },
        { id: 'pacificIslander', label: 'Pacific Islander', mix: { african: 0.25, asian: 0.5, caucasian: 0.25 }, face: { headWidth: 0.5, headSquare: 0.3, cheeks: 0.25, cheekBones: 0.2, jaw: 0.45, noseWidth: 0.5, noseHump: -0.2, lowerLip: 0.35, upperLip: 0.25, browRidge: 0.2, headFat: 0.15 }, tones: ['#c99a6c', '#b08154', '#966a42', '#7c5434'] },
        { id: 'aboriginalAustralian', label: 'Aboriginal Australian', mix: { african: 0.6, asian: 0.1, caucasian: 0.3 }, face: { noseWidth: 0.6, nostrils: 0.3, noseLength: -0.15, noseHump: -0.1, browRidge: 0.6, browHeight: -0.15, lowerLip: 0.35, upperLip: 0.3, jaw: 0.2, eyeSize: -0.05 }, tones: ['#8a5e40', '#714a30', '#5e3b26', '#4a2e1e'] }
    ];
    const PEOPLE_BY_ID = new Map(PEOPLES.map(p => [p.id, p]));

    /** Eye colors as they occur among each people: most brown; blue, green and grey mostly among Europeans. */
    const BROWNS = ['#3a2414', '#4a2e1a', '#5a3820', '#3a2414', '#2e1c10'];
    const IRISES = {
        european: ['#3a8ad8', '#5a8ab0', '#4a8a4a', '#6a7a5a', '#7a7468', '#5a3820', '#6a4a2a', '#8a6a3a'],
        middleEastern: BROWNS.concat(['#6a4a2a', '#8a6a3a', '#5a6a4a']), centralAsian: BROWNS.concat(['#6a4a2a', '#5a6a4a', '#5a7a8a']),
        southAsian: BROWNS.concat(['#6a4a2a']), latinAmerican: BROWNS.concat(['#6a4a2a', '#8a6a3a']), mixed: BROWNS.concat(['#6a4a2a', '#4a8a4a', '#5a8ab0'])
    };
    /** An eye color for a people, `t` 0..1 picking among its own. */
    function irisFor(id, t) {
        const list = IRISES[id] || BROWNS;
        return list[Math.min(list.length - 1, Math.floor(Math.max(0, t) * list.length))];
    }

    /** A people chosen on a recipe: its blend set, its middle skin tone (unless `keepSkin`), its id kept with the blend. */
    function withPeople(recipe, id, keepSkin) {
        const p = PEOPLE_BY_ID.get(id);
        const r = Object.assign({}, recipe);
        if (!p) { r.ancestry = Object.assign({}, r.ancestry, { people: '' }); return r; }
        r.ancestry = Object.assign({}, p.mix, { people: p.id });
        if (!keepSkin) r.skin = p.tones[Math.floor((p.tones.length - 1) / 2)];
        return r;
    }

    const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+x) ? +x : lo));

    const macro = (r, key) => {
        const [lo, hi] = MACRO_RANGES[key].extreme;
        return clamp(r[key] ?? DEFAULT_RECIPE[key], lo, hi);
    };

    /** A full recipe from a partial one: every field present and in range. */
    function normalizeRecipe(input) {
        const r = input || {};
        const out = {
            species: 'human',
            gender: clamp(r.gender ?? DEFAULT_RECIPE.gender, 0, 1),
            age: clamp(r.age ?? DEFAULT_RECIPE.age, MIN_AGE, MAX_AGE),
            muscle: macro(r, 'muscle'),
            weight: macro(r, 'weight'),
            height: macro(r, 'height'),
            cup: macro(r, 'cup'),
            firmness: macro(r, 'firmness'),
            proportions: macro(r, 'proportions'),
            ancestry: {},
            shapes: {},
            headSize: clamp(r.headSize ?? 1, 0.5, 2.2),
            anatomy: {
                detail: r.anatomy?.detail === true,
                areola: clamp(r.anatomy?.areola ?? 1, 0.4, 2.5), nipple: clamp(r.anatomy?.nipple ?? 1, 0, 3), fold: clamp(r.anatomy?.fold ?? 1, 0, 2),
                nippleProjection: clamp(r.anatomy?.nippleProjection ?? r.anatomy?.nipple ?? 1, 0, 10),
                mons: clamp(r.anatomy?.mons ?? 1, 0, 3), labia: clamp(r.anatomy?.labia ?? 1, 0, 3),
                innerLabia: clamp(r.anatomy?.innerLabia ?? 1, 0, 3), clitoris: clamp(r.anatomy?.clitoris ?? 1, 0, 3),
                paired: r.anatomy?.paired == null ? r.species === 'klingon' : r.anatomy.paired === true,
                foreskin: r.anatomy?.foreskin === 'uncircumcised' ? 'uncircumcised' : 'circumcised',
                areolaColor: /^#[0-9a-f]{6}$/i.test(r.anatomy?.areolaColor || '') ? r.anatomy.areolaColor.toLowerCase() : '',
                sex: ['auto', 'male', 'female'].includes(r.anatomy?.sex) ? r.anatomy.sex : 'auto',
                length: clamp(r.anatomy?.length ?? 0, -1, 2), girth: clamp(r.anatomy?.girth ?? 0, -1, 2), testicles: clamp(r.anatomy?.testicles ?? 0, -1, 2)
            },
            morph: {},
            skin: /^#[0-9a-f]{6}$/i.test(r.skin || '') ? r.skin.toLowerCase() : DEFAULT_RECIPE.skin
        };
        if (Number.isFinite(r.seed)) out.seed = r.seed >>> 0;
        for (const k in MORPHS) out.morph[k] = clamp(r.morph?.[k] ?? DEFAULT_RECIPE.morph[k], MORPHS[k][0], MORPHS[k][1]);
        let total = 0;
        for (const a of ANCESTRY) { out.ancestry[a] = clamp(r.ancestry?.[a] ?? DEFAULT_RECIPE.ancestry[a], 0, 1); total += out.ancestry[a]; }
        for (const a of ANCESTRY) out.ancestry[a] = total > 0 ? out.ancestry[a] / total : 1 / 3;
        // The people chosen (PEOPLES), kept with the blend; none for a blend made by hand.
        out.ancestry.people = PEOPLE_BY_ID.has(r.ancestry?.people) ? r.ancestry.people : '';
        for (const s of SLIDERS) {
            // Recipes from the first builder kept Pointed ears beside the shapes.
            const v = r.shapes?.[s.key] ?? (s.key === 'earsPointed' ? r.earsPointed : 0) ?? 0;
            out.shapes[s.key] = clamp(v, s.paired ? -s.extreme : 0, s.extreme);
        }
        return out;
    }

    /** Three-point blend: 0 → min, 0.5 → average, 1 → max; outside 0..1 the line carries on past the end. */
    function levelWeights(x) {
        if (x < 0.5) { const min = (0.5 - x) * 2; return { min, average: 1 - min, max: 0 }; }
        const max = (x - 0.5) * 2;
        return { min: 0, average: 1 - max, max };
    }

    /**
     * How a strong build carries its muscle: past average, muscle adds the
     * limb, chest and back bulk targets on top of the build blend, so a
     * strong body grows instead of only leaning out.
     */
    /**
     * The face the Proportions macro refines toward at 1, per gender (shape
     * slider values, added under the recipe's own): an oval face (squarer on a
     * man), relaxed lids resting over the top of the iris on larger eyes without bags, lips at rest with their
     * corners lifted, a finer nose, defined cheekbones over cheeks kept full (hollow cheeks read gaunt); a woman's
     * jaw and brow softer, a man's jaw and chin firmer.
     */
    const APPEAL = {
        female: { headWidth: -0.25, headFat: -0.1, cheeks: 0.1, cheekBones: 0.45, jaw: -0.4, chin: 0.25, chinWidth: -0.3, mouthHeight: 0.12, eyeSize: 0.35, eyeOpen: -0.45, eyeSlant: 0.2, eyeBags: -0.5, eyeSpacing: -0.1, headOval: 0.55,
            browRidge: -0.7, browHeight: -0.1, underbite: -0.25, noseWidth: -0.45, noseVolume: -0.3, noseLength: -0.2, noseTip: 0.2, nostrils: -0.2, upperLip: 0.35, lowerLip: -0.2, mouthWidth: -0.1, mouthCorners: 0.3, neck: -0.3 },
        male: { headWidth: -0.15, headFat: -0.05, cheeks: 0, cheekBones: 0.4, jaw: 0.4, chin: 0.3, chinWidth: 0.15, eyeOpen: -0.32, eyeBags: -0.5, headSquare: 0.35, headOval: 0.2, noseWidth: -0.15, noseHump: -0.1,
            upperLip: 0.1, lowerLip: -0.15, mouthCorners: 0.15, browHeight: -0.15, browRidge: -0.35, temples: -0.3, underbite: -0.2, neck: 0.15 }
    };
    /** With them, by their own targets (appeal/…): a defined upper lip, the mouth drawn back, an upright forehead, a younger skull. */
    const APPEAL_MOUTH = { female: { cupidsBow: 0.6, mouthBack: 0.35, foreheadForward: 0.5, younger: 0.35 }, male: { cupidsBow: 0.3, mouthBack: 0.3, foreheadForward: 0.45, younger: 0.25 } };

    const MUSCLE_BULK = { upperArmMuscle: 0.7, shoulderMuscle: 0.7, forearmMuscle: 0.6, thighMuscle: 0.55, calfMuscle: 0.5, pecs: 0.6, lats: 0.55, vshape: 0.3, neck: 0.45 };
    /** And a heavy one its fat: past the heaviest natural build, the belly, chin and limbs keep filling. */
    const FAT_SPREAD = { belly: 0.7, doubleChin: 0.6, upperArmFat: 0.5, forearmFat: 0.35, thighFat: 0.5, calfFat: 0.35, butt: 0.4, headFat: 0.35, waist: 0.5, neck: 0.3 };

    /** The build's own share of the shape sliders, added to `shapes`: a strong body's muscles, a heavy body's fat. */
    function addBuild(shapes, r) {
        const bulk = Math.max(0, (r.muscle - 0.5) * 2);
        // On a woman the pecs grow less: they lie under the breasts, whose own shape stays.
        for (const k in MUSCLE_BULK) shapes[k] = (shapes[k] || 0) + bulk * MUSCLE_BULK[k] * (k === 'pecs' ? 0.35 + 0.65 * r.gender : 1);
        const fat = Math.min(0.8, Math.max(0, r.weight - 1) * 2);
        for (const k in FAT_SPREAD) shapes[k] = (shapes[k] || 0) + fat * FAT_SPREAD[k];
        return shapes;
    }

    /** Age in years onto child (11), young (25) and old (90). */
    function ageWeights(years) {
        if (years <= 25) { const child = (25 - years) / 14; return { child, young: 1 - child, old: 0 }; }
        const old = (years - 25) / 65;
        return { child: 0, young: 1 - old, old };
    }

    /** Every shape target's weight for a recipe, by target name. Zero weights are left out. */
    /** The recipe held to the natural ranges: what the targets were made for. */
    function naturalRecipe(recipe) {
        const r = normalizeRecipe(recipe);
        for (const key in MACRO_RANGES) r[key] = clamp(r[key], ...MACRO_RANGES[key].natural);
        for (const s of SLIDERS) r.shapes[s.key] = clamp(r.shapes[s.key], s.paired ? -1 : 0, 1);
        return r;
    }

    /**
     * A two-way grid of targets (min/average/max on each axis), blended
     * bilinearly inside 0..1. Past an end, each axis carries on along its own
     * edge's slope: two extremes add, they never multiply.
     */
    function grid(x, y, name, scale, add) {
        const xc = clamp(x, 0, 1), yc = clamp(y, 0, 1);
        const X = levelWeights(xc), Y = levelWeights(yc);
        for (const i of LEVELS) for (const j of LEVELS) add(name(i, j), scale * X[i] * Y[j]);
        const past = (v, vc) => (v > vc ? ['max', (v - vc) * 2] : v < vc ? ['min', (vc - v) * 2] : null);
        const ox = past(x, xc), oy = past(y, yc);
        if (ox) for (const j of LEVELS) { add(name(ox[0], j), scale * ox[1] * Y[j]); add(name('average', j), -scale * ox[1] * Y[j]); }
        if (oy) for (const i of LEVELS) { add(name(i, oy[0]), scale * oy[1] * X[i]); add(name(i, 'average'), -scale * oy[1] * X[i]); }
    }

    function targetWeights(recipe, natural) {
        const r = natural ? naturalRecipe(recipe) : normalizeRecipe(recipe);
        const out = {};
        const add = (name, w) => { if (Math.abs(w) > 1e-5) out[name] = (out[name] || 0) + w; };
        const genders = { female: 1 - r.gender, male: r.gender };
        const ages = ageWeights(r.age);
        // MakeHuman's height targets run from 1.2 m to 2.4 m; the slider spans about 1.45 to 2.05 m for an average man.
        // Past each target's own end (1.2 m and 2.4 m) the body is scaled whole instead (heightScale): pushed
        // further, the targets bulge the knees and fold the joints.
        const height = r.height < 0.5 ? { min: Math.min(1, (0.5 - r.height) * 1.4), max: 0 } : { min: 0, max: Math.min(1, (r.height - 0.5) * 0.9) };
        for (const g in genders) for (const a of AGES) {
            const ga = genders[g] * ages[a];
            if (ga <= 0) continue;
            // Past a little beyond natural, weight is volume (inflate), not more of the target, which folds.
            // Muscle past natural is the muscles' own swelling (VOLUME, from MUSCLE_BULK), not more of the build
            // target, which raises humps over the shoulders and folds at the armpits.
            // Below the thinnest/least muscular source body, extrapolating
            // negative blend weights folds the trunk and limbs inside out.
            // Further thinning is already handled by the bounded volume pass.
            grid(clamp(r.muscle, 0, 1), clamp(r.weight, 0, 1.4), (m, w) => `macro/${g}-${a}-${m}muscle-${w}weight`, ga, add);
            for (const race of ANCESTRY) add(`race/${race}-${g}-${a}`, ga * r.ancestry[race]);
            add(`proportion/${g}-${a}-ideal`, ga * r.proportions);
            add(`height/${g}-${a}-min`, ga * height.min);
            add(`height/${g}-${a}-max`, ga * height.max);
            if (g === 'female') grid(clamp(r.cup, -0.2, 1.3), r.firmness, (c, f) => `cup/female-${a}-${c}cup-${f}firmness`, ga, add);
        }
        for (const k of ['length', 'girth', 'testicles']) {
            const v = r.anatomy[k];
            if (v) add(`genital/${k}-${v < 0 ? 'decr' : 'incr'}`, Math.abs(v));
        }
        const shapes = Object.assign({}, r.shapes);
        const appeal = Math.min(1, r.proportions);
        for (const [g, w] of [['female', 1 - r.gender], ['male', r.gender]]) for (const k in APPEAL[g]) shapes[k] = (shapes[k] || 0) + appeal * w * APPEAL[g][k];
        for (const [g, w] of [['female', 1 - r.gender], ['male', r.gender]]) for (const k in APPEAL_MOUTH[g]) add(`appeal/${k}`, appeal * w * APPEAL_MOUTH[g][k]);
        // The bust's shape targets are made for a woman's breasts (as the cup is): on a man's flat chest they
        // pinch the breastbone and raise cones, so they follow the body's femaleness.
        for (const k of ['breastSpacing', 'breastHeight', 'breastPoint', 'breastFullness']) if (shapes[k]) shapes[k] *= 1 - r.gender;
        const people = PEOPLE_BY_ID.get(r.ancestry.people);
        if (people) for (const k in people.face) shapes[k] = (shapes[k] || 0) + people.face[k];
        addBuild(shapes, r);
        for (const s of SLIDERS) {
            // Eye size past natural is a scale of the eye about its eyeball (morph), not more of the target.
            let v = natural || s.key === 'eyeSize' || VOLUME[s.key] ? clamp(shapes[s.key], s.paired ? -1 : 0, VOLUME[s.key] ? 1.3 : 1) : shapes[s.key];
            if (!natural) v = eased(s.key, v);
            // Legs shorter than half the target's reach are pressed whole (shortLegs): the target crushes the thigh.
            if (s.key === 'legLength') v = Math.max(-0.5, v);
            // The nape-to-waist target also crushes a small body's abdomen when
            // extrapolated. Further shortening compresses the trunk whole.
            if (s.key === 'torsoLength' || s.key === 'neckLength') v = Math.max(-0.5, v);
            if (!s.paired) add(`shape/${s.key}`, v);
            else if (v < 0) add(`shape/${s.key}-decr`, -v);
            else add(`shape/${s.key}-incr`, v);
        }
        return out;
    }

    /**
     * Targets that fold when carried far past natural, eased there: each
     * end's reach past natural (in target lengths) runs out smoothly instead
     * of carrying on. Shrinking a nose or a mouth past its own size turns it
     * inside out; a cheekbone or cheek raised too far stands as a ridge; the
     * bust's shape targets carried far draw a flat chest into cones and
     * creases; very short legs fold at the hip; knees carried far cross.
     */
    const EASE = { noseWidth: [0.55, 0], noseLength: [0.55, 0], noseDepth: [0.6, 0], noseVolume: [0.5, 0], nostrils: [0.6, 0], mouthWidth: [0.5, 0], upperLip: [0.7, 0], lowerLip: [0.7, 0], cheekBones: [0, 0.9], cheeks: [0.7, 0.9], chin: [0.7, 0], chinHeight: [0.6, 0], underbite: [0.7, 0], mouthCorners: [0.8, 0.8],
        breastSpacing: [0.5, 0.5], breastHeight: [0.4, 0.6], breastPoint: [0.5, 0.6], breastFullness: [0.6, 0.6], chest: [0.8, 0.8], pecs: [0.8, 1], armLength: [0.8, 0], bowLegs: [0.6, 0.4] };
    function eased(key, v) {
        const e = EASE[key];
        if (!e) return v;
        const carry = (past, reach) => (reach > 0 ? reach * (1 - Math.exp(-past / reach)) : past);
        if (v < -1 && e[0]) return -1 - carry(-1 - v, e[0]);
        if (v > 1 && e[1]) return 1 + carry(v - 1, e[1]);
        return v;
    }

    /** The pack's typed views over its binary. */
    function openPack(json, bytes) {
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const view = (Type, [offset, length]) => new Type(buffer, offset, length);
        const L = json.layout;
        return {
            json,
            vertexCount: json.vertexCount,
            positions: view(Float32Array, L.positions),
            body: { source: view(Uint16Array, L.bodySource), uv: view(Float32Array, L.bodyUV), index: view(Uint32Array, L.bodyIndex) },
            skinJoints: view(Uint8Array, L.skinJoints),
            skinWeights: view(Float32Array, L.skinWeights),
            bones: json.bones,
            helpers: Object.fromEntries(Object.entries(L.helpers || {}).map(([name, h]) => [name, { source: view(Uint16Array, h.source), uv: view(Float32Array, h.uv), index: view(Uint32Array, h.index) }])),
            targets: new Map(json.targets.map(t => [t.name, { scale: t.scale, index: view(Uint16Array, t.index), delta: view(Int16Array, t.delta) }])),
            eyes: {
                refs: view(Uint16Array, L.eyes.refs), weights: view(Float32Array, L.eyes.weights), offsets: view(Float32Array, L.eyes.offsets),
                source: view(Uint16Array, L.eyes.source), uv: view(Float32Array, L.eyes.uv), index: view(Uint32Array, L.eyes.index),
                scale: L.eyes.scale, texture: L.eyes.texture
            }
        };
    }

    const DATA_PATH = 'src/forge/Character3D/data';

    /**
     * The pack's folder on disk. A module's __dirname is this file's folder;
     * in an NW.js page it is the page's folder, the editor root.
     */
    function dataFolder() {
        const fs = require('fs'), path = require('path');
        const here = typeof __dirname === 'string' ? __dirname : process.cwd();
        const candidates = [path.join(here, 'data'), path.join(here, DATA_PATH), path.join(path.resolve(here, '..'), DATA_PATH), path.join(process.cwd(), DATA_PATH)];
        return candidates.find(dir => fs.existsSync(path.join(dir, 'human.json'))) || candidates[1];
    }

    /** Reads the pack (desktop: the file system; browser: fetch of the editor's served files). */
    async function loadPack(dir) {
        const base = dir || DATA_PATH;
        if (typeof require === 'function') {
            try {
                const fs = require('fs'), path = require('path');
                const folder = dir && path.isAbsolute(dir) ? dir : dataFolder();
                const json = JSON.parse(fs.readFileSync(path.join(folder, 'human.json'), 'utf8'));
                return openPack(json, fs.readFileSync(path.join(folder, 'human.bin')));
            } catch (error) {
                if (typeof fetch !== 'function') throw error;
            }
        }
        const [json, bin] = await Promise.all([
            fetch(base + '/human.json').then(r => r.json()),
            fetch(base + '/human.bin').then(r => r.arrayBuffer())
        ]);
        return openPack(json, new Uint8Array(bin));
    }

    /** Shaped positions (meters, MakeHuman's frame: y up, facing +z) for a recipe. */
    function applyTargets(pack, weights, positions) {
        for (const name in weights) {
            const t = pack.targets.get(name);
            if (!t) continue;
            const k = weights[name] * t.scale, idx = t.index, d = t.delta;
            for (let i = 0; i < idx.length; i++) {
                const v = idx[i] * 3;
                positions[v] += d[i * 3] * k;
                positions[v + 1] += d[i * 3 + 1] * k;
                positions[v + 2] += d[i * 3 + 2] * k;
            }
        }
    }

    /** Every vertex's neighbors over the body and helper faces, as a compact list (offsets + flat). */
    function neighbors(pack) {
        if (pack._neighbors) return pack._neighbors;
        const n = pack.vertexCount, sets = Array.from({ length: n }, () => new Set());
        const addFaces = (source, index) => {
            for (let t = 0; t < index.length; t += 3) {
                const a = source[index[t]], b = source[index[t + 1]], c = source[index[t + 2]];
                sets[a].add(b); sets[a].add(c); sets[b].add(a); sets[b].add(c); sets[c].add(a); sets[c].add(b);
            }
        };
        addFaces(pack.body.source, pack.body.index);
        for (const h of Object.values(pack.helpers || {})) addFaces(h.source, h.index);
        const offsets = new Uint32Array(n + 1);
        for (let v = 0; v < n; v++) offsets[v + 1] = offsets[v] + sets[v].size;
        const flat = new Uint32Array(offsets[n]);
        for (let v = 0; v < n; v++) flat.set([...sets[v]], offsets[v]);
        return (pack._neighbors = { offsets, flat });
    }

    /**
     * Relaxes a displacement field over the mesh: each pass moves every vertex's
     * value halfway to its neighbors' mean. Vertices with no neighbors (joint
     * markers) keep theirs.
     */
    function relax(pack, field, passes) {
        const { offsets, flat } = neighbors(pack);
        const n = pack.vertexCount;
        let a = field, b = new Float32Array(field.length);
        for (let p = 0; p < passes; p++) {
            for (let v = 0; v < n; v++) {
                const s = offsets[v], e = offsets[v + 1];
                if (e === s) { b[v * 3] = a[v * 3]; b[v * 3 + 1] = a[v * 3 + 1]; b[v * 3 + 2] = a[v * 3 + 2]; continue; }
                let x = 0, y = 0, z = 0;
                for (let i = s; i < e; i++) { const u = flat[i] * 3; x += a[u]; y += a[u + 1]; z += a[u + 2]; }
                const k = 1 / (e - s);
                b[v * 3] = 0.5 * a[v * 3] + 0.5 * x * k;
                b[v * 3 + 1] = 0.5 * a[v * 3 + 1] + 0.5 * y * k;
                b[v * 3 + 2] = 0.5 * a[v * 3 + 2] + 0.5 * z * k;
            }
            const t = a; a = b; b = t;
        }
        return a;
    }

    const EXTREME_PASSES = 24;
    const FACE_SECTIONS = new Set(['Head shape', 'Forehead and brows', 'Eyes', 'Nose', 'Mouth and jaw', 'Ears']);
    const FACE_KEYS = new Set(SLIDERS.filter(s => FACE_SECTIONS.has(s.section)).map(s => s.key));
    const EAR_KEYS = new Set(SLIDERS.filter(s => s.section === 'Ears').map(s => s.key));
    const LOCAL_TARGET = /^shape\//;

    /**
     * Targets laid on relaxed (passes each): MakeHuman's cheekbone target
     * stops short in the middle of the cheek, so even within its natural
     * range its back edge stands as a ledge with a dark crease under it;
     * its chest-depth target scales the modeled nipples forward into points.
     */
    const SOFT_PASSES = { cheekBones: 8, chest: 6 };
    const SOFT_TARGET = new RegExp('^shape/(' + Object.keys(SOFT_PASSES).join('|') + ')-(?:incr|decr)$');

    /** The vertices a soft target's relaxed move can reach: its own and as many rings round them as it relaxes. */
    function softRegion(pack, key) {
        pack._softRegions = pack._softRegions || new Map();
        if (pack._softRegions.has(key)) return pack._softRegions.get(key);
        const { offsets, flat } = neighbors(pack), seen = new Set();
        let ring = [];
        for (const name of ['shape/' + key + '-incr', 'shape/' + key + '-decr']) { const t = pack.targets.get(name); if (t) for (const v of t.index) if (!seen.has(v)) { seen.add(v); ring.push(v); } }
        for (let r = 0; r < SOFT_PASSES[key]; r++) {
            const next = [];
            for (const v of ring) for (let i = offsets[v]; i < offsets[v + 1]; i++) if (!seen.has(flat[i])) { seen.add(flat[i]); next.push(flat[i]); }
            ring = next;
        }
        const region = Uint32Array.from(seen);
        pack._softRegions.set(key, region);
        return region;
    }

    /** `relax`, worked only over `region` (a field zero outside it stays zero there). */
    function relaxIn(pack, field, passes, region) {
        const { offsets, flat } = neighbors(pack);
        let a = field, b = Float32Array.from(field);
        for (let p = 0; p < passes; p++) {
            for (const v of region) {
                const s = offsets[v], e = offsets[v + 1];
                if (e === s) continue;
                let x = 0, y = 0, z = 0;
                for (let i = s; i < e; i++) { const u = flat[i] * 3; x += a[u]; y += a[u + 1]; z += a[u + 2]; }
                const k = 1 / (e - s);
                b[v * 3] = 0.5 * a[v * 3] + 0.5 * x * k;
                b[v * 3 + 1] = 0.5 * a[v * 3 + 1] + 0.5 * y * k;
                b[v * 3 + 2] = 0.5 * a[v * 3 + 2] + 0.5 * z * k;
            }
            const t = a; a = b; b = t;
        }
        return a;
    }

    /** Per vertex, how near the core of some target it is: its move against that target's largest, 0..1. */
    function coreOf(pack, weights) {
        const core = new Float32Array(pack.vertexCount);
        pack._targetMax = pack._targetMax || new Map();
        for (const name in weights) {
            const t = pack.targets.get(name);
            if (!t) continue;
            let max = pack._targetMax.get(name);
            if (max == null) {
                max = 0;
                for (let i = 0; i < t.index.length; i++) max = Math.max(max, Math.hypot(t.delta[i * 3], t.delta[i * 3 + 1], t.delta[i * 3 + 2]));
                pack._targetMax.set(name, max);
            }
            for (let i = 0; i < t.index.length; i++) core[t.index[i]] = Math.max(core[t.index[i]], Math.hypot(t.delta[i * 3], t.delta[i * 3 + 1], t.delta[i * 3 + 2]) / (max || 1));
        }
        return core;
    }

    /**
     * The ear's own skin, 0..1: 1 on the outer ear, 0 on the head round it.
     * Measured by the targets that move the outer ear alone (sticking out,
     * pointed, lobe, round); its root, which those barely move, fades out.
     * The ear-size, -height and -tilt targets also carry the cheek and
     * temple in front of the ear: past natural, only this part of them is
     * carried on, so a big ear grows from the head instead of dragging the
     * cheek out into a flap.
     */
    function earMask(pack) {
        if (pack._earMask) return pack._earMask;
        const ratio = new Float32Array(pack.vertexCount);
        for (const name of ['shape/earOut-incr', 'shape/earOut-decr', 'shape/earsPointed', 'shape/earLobe-incr', 'shape/earLobe-decr', 'shape/earsRound']) {
            const t = pack.targets.get(name);
            if (!t) continue;
            let max = 0;
            for (let i = 0; i < t.index.length; i++) max = Math.max(max, Math.hypot(t.delta[i * 3], t.delta[i * 3 + 1], t.delta[i * 3 + 2]));
            for (let i = 0; i < t.index.length; i++) ratio[t.index[i]] = Math.max(ratio[t.index[i]], Math.hypot(t.delta[i * 3], t.delta[i * 3 + 1], t.delta[i * 3 + 2]) / (max || 1));
        }
        const field = new Float32Array(pack.vertexCount * 3);
        for (let v = 0; v < pack.vertexCount; v++) { const t = Math.max(0, Math.min(1, (ratio[v] - 0.06) / 0.3)); field[v * 3] = t * t * (3 - 2 * t); }
        const smooth = relax(pack, field, 1), mask = new Float32Array(pack.vertexCount);
        for (let v = 0; v < pack.vertexCount; v++) mask[v] = Math.min(1, smooth[v * 3] * 1.15);
        return (pack._earMask = mask);
    }

    /**
     * Shaped positions (meters, MakeHuman's frame: y up, facing +z) for a recipe.
     * Within the natural ranges the targets blend as made. Past them the
     * extra displacement is relaxed over the mesh before it is added, so a
     * target carried three times as far swells smoothly instead of folding.
     */
    function shape(pack, recipe, out) {
        const positions = out && out.length === pack.positions.length ? out : new Float32Array(pack.positions.length);
        positions.set(pack.positions);
        const natural = targetWeights(recipe, true), full = targetWeights(recipe);
        const narrowing = {};
        for (const key of ['hips', 'shoulders']) {
            const name = 'shape/' + key + '-decr';
            if (full[name]) narrowing[name] = [natural[name] || 0, full[name]];
            delete natural[name]; delete full[name];
        }
        // Targets whose edge stands as a ledge are laid on relaxed, whole (natural and past it).
        const soft = {};
        for (const name in full) { const k = SOFT_TARGET.exec(name); if (k) { soft[k[1]] = soft[k[1]] || {}; soft[k[1]][name] = full[name]; } }
        for (const key in soft) for (const name in soft[key]) delete natural[name];
        applyTargets(pack, natural, positions);
        for (const key in soft) {
            const field = new Float32Array(positions.length);
            applyTargets(pack, soft[key], field);
            const region = softRegion(pack, key), eased = relaxIn(pack, field, SOFT_PASSES[key], region);
            for (const v of region) for (let k = 0; k < 3; k++) positions[v * 3 + k] += eased[v * 3 + k] * 1.15;
        }
        const extra = {};
        let any = false;
        for (const name of new Set([...Object.keys(natural), ...Object.keys(full)])) {
            if (SOFT_TARGET.test(name)) continue;
            const d = (full[name] || 0) - (natural[name] || 0);
            if (Math.abs(d) > 1e-5) { extra[name] = d; any = true; }
        }
        if (any) {
            // A face slider's target is a small local shape that does not fold: carried past natural as it is.
            // The body's are relaxed, or smoothing would erase a nose or a lip altogether.
            const local = {}, broad = {}, ear = {};
            for (const name in extra) {
                const key = LOCAL_TARGET.test(name) ? name.slice(6).replace(/-(incr|decr)$/, '') : '';
                (EAR_KEYS.has(key) ? ear : FACE_KEYS.has(key) ? local : broad)[name] = extra[name];
            }
            const field = new Float32Array(positions.length);
            applyTargets(pack, broad, field);
            const smooth = relax(pack, field, EXTREME_PASSES);
            for (let i = 0; i < positions.length; i++) positions[i] += smooth[i];
            // Face targets past natural: a light relax, enough to iron out creases, not the feature.
            const near = new Float32Array(positions.length);
            applyTargets(pack, local, near);
            // Ear targets past natural move the outer ear only.
            if (Object.keys(ear).length) {
                const ears = new Float32Array(positions.length), mask = earMask(pack);
                applyTargets(pack, ear, ears);
                for (let v = 0; v < pack.vertexCount; v++) for (let k = 0; k < 3; k++) near[v * 3 + k] += ears[v * 3 + k] * mask[v];
            }
            // The feature itself takes a light relax; the skin a target barely moves round it (where its small
            // unevenness, carried three times as far, would crumple the cheek) takes a thorough one.
            const eased = relax(pack, near, 4), ironed = relax(pack, near, 16), core = coreOf(pack, Object.assign({}, local, ear));
            for (let v = 0; v < pack.vertexCount; v++) {
                const c = core[v], w = c >= 0.5 ? 1 : c <= 0.12 ? 0 : ((c - 0.12) / 0.38) ** 2 * (3 - 2 * (c - 0.12) / 0.38);
                for (let k = 0; k < 3; k++) positions[v * 3 + k] += eased[v * 3 + k] * w + ironed[v * 3 + k] * (1 - w);
            }
        }
        const r = normalizeRecipe(recipe);
        for (const name in narrowing) {
            // A width target stores meter offsets on the source body. Applying
            // that same offset to a much smaller body can cross its center.
            // Preserve its relative width instead, on the already shaped body.
            const [base, full] = narrowing[name], field = new Float32Array(positions.length);
            let extra = field;
            if (Math.abs(full - base) > 1e-5) {
                applyTargets(pack, { [name]: full - base }, field);
                extra = relax(pack, field, EXTREME_PASSES);
            }
            applyTargets(pack, { [name]: base }, extra);
            for (let v = 0; v < positions.length; v += 3) {
                const x = pack.positions[v];
                if (Math.abs(x) > 1e-6) positions[v] *= Math.max(0.1, 1 + extra[v] / x);
                positions[v + 1] += extra[v + 1]; positions[v + 2] += extra[v + 2];
            }
        }
        shortSegment(pack, positions, r.shapes.torsoLength, 'Hips', 'Neck');
        shortSegment(pack, positions, r.shapes.neckLength, 'Neck', 'Head');
        shortLegs(pack, positions, r);
        volume(pack, positions, r);
        morph(pack, positions, r);
        navelDetail(pack, positions);
        const k = heightScale(r);
        if (k !== 1) {
            let floor = Infinity;
            for (const v of pack.body.source) floor = Math.min(floor, positions[v * 3 + 1]);
            for (let i = 0; i < positions.length; i += 3) { positions[i] *= k; positions[i + 1] = floor + (positions[i + 1] - floor) * k; positions[i + 2] *= k; }
        }
        return positions;
    }

    /** Shorten the trunk or neck with a monotone vertical map, carrying the
     * anatomy above it down together. An absolute target offset can otherwise
     * pull the ribs through the waist, or the head through its neck. */
    function shortSegment(pack, P, value, lower, upper) {
        const past = -(value || 0) - 0.5;
        if (past <= 0) return;
        const low = pack.bones.find(b => b.name === lower), high = pack.bones.find(b => b.name === upper);
        const bottom = meanOf(P, low.head)[1], top = meanOf(P, high.head)[1];
        if (top <= bottom) return;
        const scale = Math.max(0.55, 1 - 0.156 * past), shift = (top - bottom) * (1 - scale);
        for (let i = 1; i < P.length; i += 3) {
            const y = P[i];
            if (y > bottom) P[i] = y < top ? bottom + (y - bottom) * scale : y - shift;
        }
    }

    /**
     * Legs shorter than half the leg-length target's reach: the legs pressed
     * toward the hip joints (by how much the leg bones carry each vertex),
     * so they shorten whole, thigh and shin alike, instead of the target
     * crushing the top of the thigh into a fold.
     */
    function shortLegs(pack, P, r) {
        const past = -(r.shapes.legLength || 0) - 0.5;
        if (past <= 0) return;
        if (!pack._legWeight) {
            const legs = pack.bones.map((b, i) => (/(UpLeg|Leg|Foot|ToeBase)$/.test(b.name) ? i : -1)).filter(i => i >= 0);
            const w = new Float32Array(pack.vertexCount);
            for (let v = 0; v < pack.vertexCount; v++) for (let k = 0; k < 4; k++) if (legs.includes(pack.skinJoints[v * 4 + k])) w[v] += pack.skinWeights[v * 4 + k];
            pack._legWeight = w;
        }
        const up = pack.bones.find(b => b.name === 'LeftUpLeg'), hip = meanOf(P, up.head)[1];
        const k = Math.max(0.55, 1 - 0.156 * past);
        for (let v = 0; v < pack.vertexCount; v++) {
            const w = pack._legWeight[v], y = P[v * 3 + 1];
            if (w > 0 && y < hip) P[v * 3 + 1] = y + (hip + (y - hip) * k - y) * w;
        }
    }

    /** The whole body's scale for a height past its targets' ends: on from 1.2 m down and 2.4 m up, in proportion. */
    function heightScale(r) {
        const below = (0.5 - r.height) * 1.4 - 1, above = (r.height - 0.5) * 0.9 - 1;
        if (below > 0) return Math.max(0.35, 1 - 0.42 * below);
        if (above > 0) return 1 + 0.29 * above;
        return 1;
    }

    /**
     * Sliders that are volume: past their natural range they swell. Each has
     * the target its swelling takes its place from (where on the body, and
     * how much where), how far a step past natural reaches (meters), and how
     * much it sags.
     */
    const VOLUME = {
        belly: { targets: ['shape/belly-incr'], reach: 0.075, sag: 0.35 },
        butt: { targets: ['shape/butt-incr'], reach: 0.06, sag: 0.15 },
        hips: { targets: ['shape/hips-incr'], reach: 0.04, sag: 0 },
        thighFat: { targets: ['shape/thighFat-incr'], reach: 0.04, sag: 0.05 },
        upperArmFat: { targets: ['shape/upperArmFat-incr'], reach: 0.03, sag: 0.1 },
        calfFat: { targets: ['shape/calfFat-incr'], reach: 0.025, sag: 0 },
        doubleChin: { targets: ['shape/doubleChin-incr'], reach: 0.025, sag: 0.3 },
        // Muscle: past its natural range a muscle grows round along its own shape, never by carrying its
        // target's moves further, which raise fins and ridges where the target ends; its mask softened
        // further (`soft` relax passes), so neighboring muscles' swellings meet without a crease.
        upperArmMuscle: { targets: ['shape/upperArmMuscle-incr'], reach: 0.016, sag: 0, soft: 14 },
        shoulderMuscle: { targets: ['shape/shoulderMuscle-incr'], reach: 0.015, sag: 0, soft: 14 },
        forearmMuscle: { targets: ['shape/forearmMuscle-incr'], reach: 0.013, sag: 0, soft: 14 },
        thighMuscle: { targets: ['shape/thighMuscle-incr'], reach: 0.014, sag: 0, soft: 14 },
        calfMuscle: { targets: ['shape/calfMuscle-incr'], reach: 0.014, sag: 0, soft: 14 },
        pecs: { targets: ['shape/pecs-incr'], reach: 0.011, sag: 0, soft: 14 },
        lats: { targets: ['shape/lats-incr'], reach: 0.012, sag: 0, soft: 14 },
        neck: { targets: ['shape/neck-incr'], reach: 0.01, sag: 0, soft: 14 }
    };

    /** A smooth 0..1 mask from how far some targets move each vertex, relaxed so its edge fades. */
    function maskOf(pack, names, passes = 8) {
        pack._masks = pack._masks || new Map();
        const key = names.join('|');
        if (pack._masks.has(key)) return pack._masks.get(key);
        const field = new Float32Array(pack.vertexCount * 3);
        for (const name of names) {
            const t = pack.targets.get(name);
            if (!t) continue;
            for (let i = 0; i < t.index.length; i++) {
                const m = Math.hypot(t.delta[i * 3], t.delta[i * 3 + 1], t.delta[i * 3 + 2]) * t.scale;
                field[t.index[i] * 3] = Math.max(field[t.index[i] * 3], m);
            }
        }
        const smooth = relax(pack, field, passes);
        let max = 0;
        for (let v = 0; v < pack.vertexCount; v++) max = Math.max(max, smooth[v * 3]);
        const mask = new Float32Array(pack.vertexCount);
        for (let v = 0; v < pack.vertexCount; v++) mask[v] = max > 0 ? Math.min(1, smooth[v * 3] / max * 1.25) : 0;
        pack._masks.set(key, mask);
        return mask;
    }

    /**
     * Each breast's swelling, centered on its nipple (so the apex, the areola
     * painted round the nipple and any sag move together): a smooth dome of
     * the chest's front around it, none on the other breast or behind.
     */
    function breastMask(pack) {
        if (pack._breastMask) return pack._breastMask;
        const B = pack.positions, F = anatomyFields(pack), mask = new Float32Array(pack.vertexCount);
        const R = 0.12;
        for (const nip of F.nipples) {
            const c = [B[nip.v * 3], B[nip.v * 3 + 1], B[nip.v * 3 + 2]], side = Math.sign(c[0]);
            for (const v of pack.body.source) {
                if (Math.sign(B[v * 3]) !== side && Math.abs(B[v * 3]) > 0.01) continue;
                if (B[v * 3 + 2] < c[2] - 0.12) continue;
                // A little taller than wide; more below the nipple than above (the breast's own shape).
                const dx = B[v * 3] - c[0], dy = (B[v * 3 + 1] - c[1]) * (B[v * 3 + 1] < c[1] ? 0.85 : 1.25), dz = (B[v * 3 + 2] - c[2]) * 0.6;
                const d = Math.hypot(dx, dy, dz) / R;
                if (d < 1) mask[v] = Math.max(mask[v], (1 - d * d) ** 2);
            }
        }
        return (pack._breastMask = mask);
    }

    /** Where fat goes on a heavy body: how far MakeHuman's heaviest build moves each vertex from the average. */
    function fatMask(pack) {
        if (pack._fatMask) return pack._fatMask;
        const names = [];
        for (const g of ['female', 'male']) names.push(`macro/${g}-young-averagemuscle-maxweight`);
        const mask = maskOf(pack, names, 6).slice();
        // The hands, feet and face take little; the trunk, the seat and the tops of the limbs the most.
        const head = pack.bones.findIndex(b => b.name === 'Head');
        const light = pack.bones.map((b, i) => (/Hand|Foot|ToeBase|Head$/.test(b.name) ? i : -1)).filter(i => i >= 0);
        // The eyes stay open on any body: round each eye (lids, sockets, the cheek under it) nothing swells.
        const B = pack.positions, eyeIds = [...new Set(pack.eyes.refs)];
        const eyeC = [1, -1].map(sd => { const own = eyeIds.filter(v => Math.sign(B[v * 3]) === sd); return [0, 1, 2].map(k => own.reduce((a, v) => a + B[v * 3 + k], 0) / own.length); });
        // Nor the nose or the ears, and the lips ride out on it hardly thickened: fat gathers under the chin and in the cheeks.
        const nose = maskOf(pack, ['shape/noseVolume-incr', 'shape/noseWidth-incr'], 3), ears = maskOf(pack, ['shape/earSize-incr'], 2);
        const lips = maskOf(pack, ['shape/upperLip-incr', 'shape/lowerLip-incr'], 2);
        for (let v = 0; v < pack.vertexCount; v++) {
            let lw = 0;
            for (let k = 0; k < 4; k++) if (light.includes(pack.skinJoints[v * 4 + k])) lw += pack.skinWeights[v * 4 + k] * (pack.skinJoints[v * 4 + k] === head ? 0.6 : 0.85);
            let eye = 1;
            for (const c of eyeC) { const d = Math.hypot(B[v * 3] - c[0], B[v * 3 + 1] - c[1], B[v * 3 + 2] - c[2]); eye = Math.min(eye, Math.max(0, Math.min(1, (d - 0.022) / 0.03))); }
            mask[v] = Math.max(0.12, mask[v]) * (1 - lw) * eye * eye * (1 - 0.85 * nose[v]) * (1 - 0.3 * lips[v]) * (1 - 0.9 * ears[v]);
        }
        return (pack._fatMask = mask);
    }

    /** Each vertex off the body (helpers, joints) moves with its nearest body vertex. */
    function followers(pack) {
        if (pack._followers) return pack._followers;
        const B = pack.positions, onBody = new Set(pack.body.source), cell = 0.03;
        const grid = new Map(), key = (x, y, z) => x + ',' + y + ',' + z;
        for (const v of onBody) {
            const k = key(Math.floor(B[v * 3] / cell), Math.floor(B[v * 3 + 1] / cell), Math.floor(B[v * 3 + 2] / cell));
            if (!grid.has(k)) grid.set(k, []);
            grid.get(k).push(v);
        }
        const map = new Int32Array(pack.vertexCount).fill(-1);
        for (let v = 0; v < pack.vertexCount; v++) {
            if (onBody.has(v)) { map[v] = v; continue; }
            const cx = Math.floor(B[v * 3] / cell), cy = Math.floor(B[v * 3 + 1] / cell), cz = Math.floor(B[v * 3 + 2] / cell);
            let best = -1, bd = Infinity;
            for (let r = 1; r <= 4 && best < 0; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) for (let k = -r; k <= r; k++) {
                for (const u of grid.get(key(cx + i, cy + j, cz + k)) || []) {
                    const d = (B[u * 3] - B[v * 3]) ** 2 + (B[u * 3 + 1] - B[v * 3 + 1]) ** 2 + (B[u * 3 + 2] - B[v * 3 + 2]) ** 2;
                    if (d < bd) { bd = d; best = u; }
                }
            }
            map[v] = best;
        }
        return (pack._followers = map);
    }

    /**
     * Swelling and shrinking past the natural range: each volume slider, the
     * bust and the weight push the skin out along its normals by their masks,
     * in a few steps (the normals worked out again each step, so a swelling
     * rounds out like a balloon rather than a cone), relaxed between steps,
     * sagging a little under its own weight.
     */
    function volume(pack, P, r) {
        const n = pack.vertexCount;
        const amount = new Float32Array(n), sag = new Float32Array(n);
        let any = false;
        const addMask = (mask, meters, droop) => {
            if (!meters) return;
            any = true;
            for (let v = 0; v < n; v++) if (mask[v] > 0) { amount[v] += mask[v] * meters; sag[v] += mask[v] * Math.abs(meters) * droop; }
        };
        // The sliders with the build's share (a strong body's muscles) added: past natural, that share swells too.
        const built = addBuild(Object.assign({}, r.shapes), r);
        for (const key in VOLUME) {
            // A woman's muscles swell less past natural: an athlete's build, not a man's mass.
            const past = ((built[key] || 0) - 1.3) * (MUSCLE_BULK[key] ? 0.7 + 0.3 * r.gender : 1);
            if (past > 0) addMask(maskOf(pack, VOLUME[key].targets, VOLUME[key].soft || 8), past * VOLUME[key].reach, VOLUME[key].sag);
        }
        if (r.cup > 1.3 && r.gender < 0.9) {
            const firm = clamp(r.firmness, 0, 1);
            addMask(breastMask(pack), (r.cup - 1.3) * 0.045 * (1 - r.gender), 0.45 - 0.3 * firm);
        }
        if (r.weight > 1.4) addMask(fatMask(pack), (r.weight - 1.4) * 0.07, 0.2);
        // Thin past natural: the soft parts drawn in toward the bone, never through it.
        if (r.weight < 0) addMask(fatMask(pack), Math.max(-0.03, r.weight * 0.03), 0);
        // Very strong and not heavy: ripped, the soft fat drawn in so the muscles stand out and the waist narrows.
        if (r.muscle > 1 && r.weight < 0.8) addMask(fatMask(pack), -Math.min(0.009, (r.muscle - 1) * 0.006) * (1 - smooth01(0.4, 0.8, r.weight)), 0);
        if (!any) return;
        // An inward offset safe on an average body can pass through a thin
        // wrist or waist. Limit shrinking to a fraction of the skin's current
        // distance from its carrying bone, including already shortened limbs.
        const shrinking = amount.some(x => x < 0);
        if (shrinking) {
            const axes = joints(pack, P);
            for (let v = 0; v < n; v++) {
                if (amount[v] >= 0) continue;
                let radius = Infinity;
                for (let k = 0; k < 4; k++) {
                    if (pack.skinWeights[v * 4 + k] < 0.1) continue;
                    const b = axes[pack.skinJoints[v * 4 + k]], a = b.head, end = b.tail || a;
                    const dx = end[0] - a[0], dy = end[1] - a[1], dz = end[2] - a[2];
                    const x = P[v * 3] - a[0], y = P[v * 3 + 1] - a[1], z = P[v * 3 + 2] - a[2];
                    const t = Math.max(0, Math.min(1, (x * dx + y * dy + z * dz) / (dx * dx + dy * dy + dz * dz || 1)));
                    radius = Math.min(radius, Math.hypot(x - dx * t, y - dy * t, z - dz * t));
                }
                if (Number.isFinite(radius)) amount[v] = Math.max(amount[v], -radius * 0.15);
            }
        }
        const follow = followers(pack);
        const reference = shrinking ? Float32Array.from(P) : null;
        const total = new Float32Array(n * 3);
        const steps = 4;
        for (let s = 0; s < steps; s++) {
            const N = vertexNormals(pack, P);
            const field = new Float32Array(n * 3);
            for (let v = 0; v < n; v++) {
                const b = follow[v];
                if (b < 0 || !amount[b]) continue;
                const a = amount[b] / steps, d = sag[b] / steps;
                field[v * 3] = N[b * 3] * a; field[v * 3 + 1] = N[b * 3 + 1] * a - d; field[v * 3 + 2] = N[b * 3 + 2] * a;
            }
            const eased = relax(pack, field, 3);
            const scale = reference ? inwardStep(pack, reference, P, eased) : 1;
            for (let i = 0; i < P.length; i++) { P[i] += eased[i] * scale; total[i] += eased[i] * scale; }
        }
        // The floor stays the floor: nothing swells below the soles.
        let low = Infinity;
        for (const v of pack.body.source) low = Math.min(low, P[v * 3 + 1]);
        void low;
    }

    /** Back off an inward step before any skin triangle turns through its original surface. */
    function inwardStep(pack, rest, P, field) {
        const source = pack.body.source, index = pack.body.index;
        let scale = 1;
        for (let attempt = 0; attempt < 9; attempt++, scale *= 0.5) {
            let safe = true;
            for (let t = 0; t < index.length; t += 3) {
                const a = source[index[t]] * 3, b = source[index[t + 1]] * 3, c = source[index[t + 2]] * 3;
                const ux = rest[b] - rest[a], uy = rest[b + 1] - rest[a + 1], uz = rest[b + 2] - rest[a + 2];
                const vx = rest[c] - rest[a], vy = rest[c + 1] - rest[a + 1], vz = rest[c + 2] - rest[a + 2];
                const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, area2 = nx * nx + ny * ny + nz * nz;
                if (area2 < 1e-22) continue;
                const x = P[b] - P[a] + (field[b] - field[a]) * scale, y = P[b + 1] - P[a + 1] + (field[b + 1] - field[a + 1]) * scale, z = P[b + 2] - P[a + 2] + (field[b + 2] - field[a + 2]) * scale;
                const X = P[c] - P[a] + (field[c] - field[a]) * scale, Y = P[c + 1] - P[a + 1] + (field[c + 1] - field[a + 1]) * scale, Z = P[c + 2] - P[a + 2] + (field[c + 2] - field[a + 2]) * scale;
                if ((y * Z - z * Y) * nx + (z * X - x * Z) * ny + (x * Y - y * X) * nz < area2 * 0.02) { safe = false; break; }
            }
            if (safe) return scale;
        }
        return 0;
    }

    /** Per pack vertex, how much the Head bone carries it; and the ear's own vertices, by how far the ear target moves them. */
    function headFields(pack) {
        if (pack._headFields) return pack._headFields;
        const head = pack.bones.findIndex(b => b.name === 'Head');
        const n = pack.vertexCount, w = new Float32Array(n), ear = new Float32Array(n);
        for (let v = 0; v < n; v++) for (let k = 0; k < 4; k++) if (pack.skinJoints[v * 4 + k] === head) w[v] += pack.skinWeights[v * 4 + k];
        const t = pack.targets.get('shape/earSize-incr');
        if (t) {
            let max = 0;
            for (let i = 0; i < t.index.length; i++) max = Math.max(max, Math.hypot(t.delta[i * 3], t.delta[i * 3 + 1], t.delta[i * 3 + 2]));
            for (let i = 0; i < t.index.length; i++) ear[t.index[i]] = Math.min(1, Math.hypot(t.delta[i * 3], t.delta[i * 3 + 1], t.delta[i * 3 + 2]) / max * 2.5);
        }
        const eyeIds = [...new Set(pack.eyes.refs)];
        return (pack._headFields = { head, w, ear, eyeIds });
    }

    /**
     * The eyes: MakeHuman's eye-size target grows the sockets and lids but
     * not the eyeballs, so the eyeballs are scaled to match it (by how much
     * the target widens the lids, measured once); past natural, socket, lids
     * and eyeball scale together about the eyeball, up to two and a half
     * times at the far end.
     */
    function eyes(pack, P, value, wide = 1, tall = 1) {
        if (!pack._eyeFields) {
            const t = pack.targets.get('shape/eyeSize-incr'), B = pack.positions;
            const eyeIds = [...new Set(pack.eyes.refs)];
            const side = v => (B[v * 3] > 0 ? 1 : -1);
            const center = sd => { const own = eyeIds.filter(v => side(v) === sd); return [0, 1, 2].map(k => own.reduce((a, v) => a + B[v * 3 + k], 0) / own.length); };
            const C = { 1: center(1), '-1': center(-1) };
            let grow = 0, n = 0;
            for (let i = 0; i < t.index.length; i++) {
                const v = t.index[i], d = [t.delta[i * 3] * t.scale, t.delta[i * 3 + 1] * t.scale];
                // How far the lids move outward from their eye, against how far they stand from it.
                if (v >= 14742 && v <= 14991) {
                    const c = C[side(v)], o = [B[v * 3] - c[0], B[v * 3 + 1] - c[1]], r = Math.hypot(o[0], o[1]) || 1;
                    grow += (o[0] * d[0] + o[1] * d[1]) / (r * r); n++;
                }
            }
            // The eyeball's radius, across the face.
            let radius = 0;
            for (const v of eyeIds) radius = Math.max(radius, Math.abs(B[v * 3] - C[side(v)][0]));
            // The face in front of the eyes, the only skin a socket may move.
            const head = pack.bones.findIndex(b => b.name === 'Head');
            const face = [];
            for (let v = 0; v < pack.vertexCount; v++) {
                let hw = 0;
                for (let k = 0; k < 4; k++) if (pack.skinJoints[v * 4 + k] === head) hw += pack.skinWeights[v * 4 + k];
                if (hw > 0.5 && B[v * 3 + 2] > C[side(v)][2] - radius * 2.5 && !eyeIds.includes(v)) face.push(v);
            }
            const w = { face, radius };
            pack._eyeFields = { eyeIds, side, weights: w, natural: n ? grow / n : 0.25 };
        }
        const F = pack._eyeFields;
        const nat = Math.max(-1, Math.min(1, value || 0));
        const extra = value > 1 ? 1 + (value - 1) * 0.5 : value < -1 ? 1 + (value + 1) * 0.2 : 1;
        // Width and tallness: the eye's own shape, across and up and down.
        const ex = extra * wide, ey = extra * tall;
        if (!nat && ex === 1 && ey === 1) return;
        const R = F.weights.radius;
        const smoothstep = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
        // The skin's moves gathered first, relaxed over the face, then laid on: the socket flows into the cheek.
        const field = new Float32Array(P.length);
        let moved = false;
        for (const sd of [1, -1]) {
            const own = F.eyeIds.filter(v => F.side(v) === sd);
            const c = [0, 1, 2].map(k => own.reduce((a, v) => a + P[v * 3 + k], 0) / own.length);
            // The eyeball: across by the whole scale, in depth by its square root, so it does not jut.
            // Across by the whole scale; in depth hardly at all, so big eyes are wide, not bulging.
            const base = 1 + F.natural * nat, ballX = base * ex, ballY = base * ey, deep = 1 + (base * Math.max(ex, ey) - 1) * 0.2;
            for (const v of own) {
                P[v * 3] = c[0] + (P[v * 3] - c[0]) * ballX;
                P[v * 3 + 1] = c[1] + (P[v * 3 + 1] - c[1]) * ballY;
                P[v * 3 + 2] = c[2] + (P[v * 3 + 2] - c[2]) * deep;
            }
            if (ex === 1 && ey === 1) continue;
            // The socket, in the face's plane: the lid opening widens with the eyeball, the skin
            // round it is pushed out less and less until, far enough out never to fold, not at all.
            // A falloff kept close to the eye, so the eye changes and the head does not, and shorter below
            // it, so the cheek and mouth stay; the relax below irons the compression it leaves.
            const dev = Math.max(0, Math.max(ex, ey) - 1, 1 - Math.min(ex, ey));
            const inner = R * 1.6, outer = inner * (1 + 0.9 * dev) + R * 0.6, outerDown = inner * (1 + 0.45 * dev) + R * 0.3;
            const along = (d, e, o) => (d <= inner ? d * e : d + (e - 1) * inner * (1 - smoothstep((d - inner) / (o - inner))));
            for (const v of F.weights.face) {
                if (F.side(v) !== sd) continue;
                const dx = P[v * 3] - c[0], dy = P[v * 3 + 1] - c[1], d = Math.hypot(dx, dy);
                const reach = dy < 0 ? outerDown : outer;
                if (d >= reach || d < 1e-6) continue;
                const kx = along(d, ex, reach) / d, ky = along(d, ey, reach) / d;
                // Toward the middle of the face the sideways push fades out, so the bridge of the nose
                // is pressed smoothly, never bunched or crossed.
                const mid = smoothstep(Math.abs(P[v * 3]) / Math.max(1e-4, Math.abs(c[0])));
                const push = dx * (kx - 1);
                field[v * 3] = push < 0 === sd > 0 ? push * mid * mid : push;
                field[v * 3 + 1] = dy * (ky - 1);
                // The lid rim, right at the eyeball, comes forward with its front.
                field[v * 3 + 2] = (deep - 1) * R * (1 - smoothstep((d - inner * 0.85) / (inner * 0.35)));
                moved = true;
            }
        }
        if (!moved) return;
        const eased = relax(pack, field, 10);
        // Laid on wherever the relaxed move reaches (past the face's own vertices too, so no edge shows);
        // the lid rim keeps more of its own move, so the eyeball stays covered.
        const own = new Set(F.eyeIds);
        for (let v = 0; v < pack.vertexCount; v++) {
            if (own.has(v)) continue;
            const keep = Math.abs(field[v * 3 + 2]) > 1e-5 ? 0.6 : 0;
            for (let k = 0; k < 3; k++) P[v * 3 + k] += eased[v * 3 + k] * (1 - keep) + field[v * 3 + k] * keep;
        }
    }

    /**
     * A grey's almond eye, one shape for its socket and the lens in it: the
     * eye's frame (forward a little out to the side, across tilted up toward
     * the outer corner), the outline's half height across it (fuller toward
     * the nose, drawn to a point at the outer corner), and the lens's height
     * off the frame (`surf(x, rr)`: a dome, its edge set back, the whole lens
     * wrapping back round the skull toward the outer corner and a little
     * toward the nose, so it lies in the face instead of standing off it).
     */
    const ALMOND = { width: 1.6, height: 0.6, tilt: 0.28, dome: 0.21, back: 0.11, wrapOut: 0.75, wrapIn: 0.15 };
    const almondHalf = out => (Math.abs(out) >= 1 ? 0 : Math.pow(1 - out * out, 0.42) * (1 - 0.22 * out));
    function almondFrame(pack, P, side, size = 1) {
        const ids = [...new Set(pack.eyes.refs)].filter(v => Math.sign(pack.positions[v * 3]) === side);
        const c0 = [0, 1, 2].map(k => ids.reduce((t, v) => t + P[v * 3 + k], 0) / ids.length);
        let R = 0;
        for (const v of ids) R = Math.max(R, Math.abs(P[v * 3] - c0[0]));
        const head = pack.bones.find(b => b.name === 'Head'), h = meanOf(P, head.head);
        const out = [c0[0] - h[0], 0, c0[2] - h[2]], ol = Math.hypot(out[0], out[2]) || 1;
        let F = [0.35 * out[0] / ol, 0, 0.65 + 0.35 * out[2] / ol];
        const fl = Math.hypot(...F); F = F.map(x => x / fl);
        const U0 = [F[2], 0, -F[0]], V0 = [0, 1, 0];
        const t = ALMOND.tilt * side, ct = Math.cos(t), st = Math.sin(t);
        const U = [0, 1, 2].map(k => U0[k] * ct + V0[k] * st), V = [0, 1, 2].map(k => -U0[k] * st + V0[k] * ct);
        const a = R * ALMOND.width * size, b = a * ALMOND.height;
        const c = [0, 1, 2].map(k => c0[k] + F[k] * R * 0.9 + U0[k] * side * a * 0.04 + V0[k] * a * 0.06);
        const lens = rr => a * (ALMOND.dome * Math.sqrt(Math.max(0, 1 - rr * rr)) - ALMOND.back * rr * rr);
        const wrap = x => { const o = x * side; return a * (o > 0 ? ALMOND.wrapOut : ALMOND.wrapIn) * o * o; };
        return { c, U, V, F, a, b, side, R, lens, surf: (x, rr) => lens(rr) - wrap(x) };
    }
    /** Where a point lies on an almond frame: across (-1..1, + outward), up, out along forward, and its ring (1 the outline). */
    function almondAt(fr, p) {
        const d = [p[0] - fr.c[0], p[1] - fr.c[1], p[2] - fr.c[2]];
        const x = (d[0] * fr.U[0] + d[1] * fr.U[1] + d[2] * fr.U[2]) / fr.a, y = (d[0] * fr.V[0] + d[1] * fr.V[1] + d[2] * fr.V[2]) / fr.b;
        const f = d[0] * fr.F[0] + d[1] * fr.F[1] + d[2] * fr.F[2], half = almondHalf(x * fr.side);
        return { x, y, f, rr: Math.abs(x) >= 1 ? Math.hypot(x, y / 0.05) : Math.hypot(x, y / Math.max(0.05, half)) };
    }

    /**
     * A grey's skull: the cranium above the brow and round the back laid on
     * one smooth dome (an ellipsoid through the head's own width, height and
     * depth, fuller in front than behind), so whatever the sliders made of
     * the human skull, no dent, ridge or lump is left on it.
     */
    function greyDome(pack, P) {
        const F = headFields(pack), own = new Set(F.eyeIds);
        const eye = meanOf(P, F.eyeIds), h = meanOf(P, pack.bones[F.head].head);
        let crown = -Infinity;
        for (let v = 0; v < F.w.length; v++) if (F.w[v] > 0.9 && P[v * 3 + 1] > crown) crown = P[v * 3 + 1];
        const H = crown - h[1], brow = eye[1] + H * 0.12;
        let ax = 0, zmin = Infinity, zmax = -Infinity;
        for (let v = 0; v < F.w.length; v++) {
            if (F.w[v] < 0.9 || own.has(v) || P[v * 3 + 1] < brow) continue;
            ax = Math.max(ax, Math.abs(P[v * 3])); zmin = Math.min(zmin, P[v * 3 + 2]); zmax = Math.max(zmax, P[v * 3 + 2]);
        }
        if (!isFinite(zmin)) return;
        // A little fuller than the skull it replaces, most of all upward: the large cranium over a small face.
        const cy = eye[1] - H * 0.05, cz = (zmin + zmax) / 2, by = (crown - cy) * 1.1, front = (zmax - cz) * 1.04, back = (cz - zmin) * 1.06;
        ax *= 1.05;
        const field = new Float32Array(P.length);
        for (let v = 0; v < F.w.length; v++) {
            if (F.w[v] <= 0 || own.has(v)) continue;
            const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
            // Above the brow everywhere; behind the head's middle down to the nape.
            // In front it starts higher, over the forehead, so the brow over the eyes keeps its own line.
            const rise = smooth01(cz, zmax, z), top = smooth01(brow - H * 0.08 + rise * H * 0.1, brow + H * 0.06 + rise * H * 0.22, y), nape = smooth01(cz + H * 0.05, cz - H * 0.15, z) * smooth01(cy - H * 0.45, cy - H * 0.1, y);
            const wd = Math.max(top, nape) * smooth01(0.5, 0.95, F.w[v]);
            if (!wd) continue;
            const dx = x / ax, dy = (y - cy) / by, dz = (z - cz) / (z > cz ? front : back);
            const e = Math.hypot(dx, Math.max(dy, -1), dz);
            if (e < 1e-6) continue;
            const k = 1 / e - 1;
            field[v * 3] = x * k * wd; field[v * 3 + 1] = (y - cy) * k * wd; field[v * 3 + 2] = (z - cz) * k * wd;
        }
        const eased = relax(pack, field, 2);
        for (let v = 0; v < F.w.length; v++) if (!own.has(v)) for (let k = 0; k < 3; k++) P[v * 3 + k] += eased[v * 3 + k];
    }

    /**
     * Sockets for a grey's almond eyes: the skin inside each outline pressed
     * back behind where the lens lies, and a soft rim raised round it, so
     * the lens sits in the face with the lids closing over its edge.
     */
    function eyeSockets(pack, P, size) {
        const face = pack._eyeFields && pack._eyeFields.weights.face;
        if (!face) return;
        // The oversized sockets amplify small human facial ridges. Fair the
        // skin before seating the lenses, keeping the eyes and mouth helpers
        // fixed. Alternating steps soften creases without shrinking the skull.
        const F = headFields(pack), { offsets, flat } = neighbors(pack);
        const own = F.surface || (F.surface = [...new Set(pack.body.source)].filter(v => F.w[v] > 0.5));
        const Q = Float32Array.from(P), next = Float32Array.from(P);
        for (let pass = 0; pass < 16; pass++) {
            const step = pass % 2 ? -0.46 : 0.5;
            for (const v of own) {
                const count = offsets[v + 1] - offsets[v];
                if (!count) continue;
                const w = smooth01(0.5, 0.95, F.w[v]);
                for (let k = 0; k < 3; k++) {
                    let mean = 0;
                    for (let i = offsets[v]; i < offsets[v + 1]; i++) mean += Q[flat[i] * 3 + k];
                    next[v * 3 + k] = Q[v * 3 + k] + step * w * (mean / count - Q[v * 3 + k]);
                }
            }
            for (const v of own) for (let k = 0; k < 3; k++) Q[v * 3 + k] = next[v * 3 + k];
        }
        for (const v of own) for (let k = 0; k < 3; k++) P[v * 3 + k] = Q[v * 3 + k];
        greyDome(pack, P);
        const field = new Float32Array(P.length), clamp = [];
        for (const side of [1, -1]) {
            const fr = almondFrame(pack, P, side, size), rimH = fr.a * 0.07;
            for (const v of face) {
                if (Math.sign(P[v * 3]) !== side) continue;
                const q = almondAt(fr, [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
                let to = null;
                const xe = Math.max(-1, Math.min(1, q.x));
                if (q.rr < 1) to = Math.min(q.f, fr.surf(xe, q.rr) - 0.003);
                else if (q.rr < 1.5 && q.f > fr.surf(xe, 1) - fr.a * 0.35) to = Math.max(q.f, fr.surf(xe, 1) + 0.0015 + rimH * Math.exp(-(((q.rr - 1.08) / 0.15) ** 2)));
                if (to === null || to === q.f) continue;
                for (let k = 0; k < 3; k++) field[v * 3 + k] = fr.F[k] * (to - q.f);
                if (q.rr < 1) clamp.push([v, fr, q.rr, xe]);
            }
        }
        const eased = relax(pack, field, 3);
        for (let v = 0; v < pack.vertexCount; v++) for (let k = 0; k < 3; k++) P[v * 3 + k] += eased[v * 3 + k];
        // Inside the outline the skin stays behind the lens however the easing spread it.
        for (const [v, fr, rr, xe] of clamp) {
            const q = almondAt(fr, [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]), to = fr.surf(xe, rr) - 0.003;
            if (q.f > to) for (let k = 0; k < 3; k++) P[v * 3 + k] += fr.F[k] * (to - q.f);
        }
    }

    /** The sex a recipe shows: chosen, or by its Gender slider. */
    function sexOf(r) {
        const a = r.anatomy || {};
        return a.sex === 'male' || a.sex === 'female' ? a.sex : (r.gender >= 0.5 ? 'male' : 'female');
    }

    /**
     * Where anatomy sits, picked once on MakeHuman's base mesh: each nipple
     * (the vertex the bust target moves most, per side) with the vertices
     * around it, and the front of the crotch along the middle.
     */
    function anatomyFields(pack) {
        if (pack._anatomyFields) return pack._anatomyFields;
        const B = pack.positions, ids = [...new Set(pack.body.source)], onBody = new Set(ids);
        // The nipple: the skin vertex MakeHuman's breast-point target moves most (it moves the nipple's tip).
        const point = pack.targets.get('shape/breastPoint-incr') || pack.targets.get('cup/female-young-maxcup-averagefirmness');
        const best = { 1: [-1, 0], '-1': [-1, 0] };
        for (let i = 0; i < point.index.length; i++) {
            const v = point.index[i];
            if (!onBody.has(v)) continue;
            const m = Math.hypot(point.delta[i * 3], point.delta[i * 3 + 1], point.delta[i * 3 + 2]);
            const side = B[v * 3] > 0 ? 1 : -1;
            if (m > best[side][1]) best[side] = [v, m];
        }
        const around = (center, r) => ids.filter(v => Math.hypot(B[v * 3] - B[center * 3], B[v * 3 + 1] - B[center * 3 + 1], B[v * 3 + 2] - B[center * 3 + 2]) < r)
            .map(v => [v, Math.hypot(B[v * 3] - B[center * 3], B[v * 3 + 1] - B[center * 3 + 1], B[v * 3 + 2] - B[center * 3 + 2]) / r]);
        // That vertex sits about a centimeter above the nipple the mesh models on a breast: the nipple is the
        // middle of the small rise there, on a woman's natural bust (the bust's swell centers on it too).
        const P = Float32Array.from(B), nb = neighbors(pack);
        applyTargets(pack, targetWeights(normalizeRecipe({ gender: 0, cup: 0.75 }), true), P);
        const N = vertexNormals(pack, P);
        const rise = v => {
            const s = nb.offsets[v], e = nb.offsets[v + 1];
            let h = 0;
            for (let i = s; i < e; i++) for (let k = 0; k < 3; k++) h += (P[v * 3 + k] - P[nb.flat[i] * 3 + k]) * N[v * 3 + k];
            return e > s ? h / (e - s) : 0;
        };
        const modeled = top => {
            const near = ids.filter(v => Math.hypot(P[v * 3] - P[top * 3], P[v * 3 + 1] - P[top * 3 + 1], P[v * 3 + 2] - P[top * 3 + 2]) < 0.016)
                .map(v => [v, rise(v)]).sort((a, b) => b[1] - a[1]).slice(0, 6);
            const w = near.reduce((sum, x) => sum + Math.max(0, x[1]), 0);
            if (!(w > 0)) return top;
            const c = [0, 1, 2].map(k => near.reduce((sum, x) => sum + P[x[0] * 3 + k] * Math.max(0, x[1]), 0) / w);
            let pick = top, dist = Infinity;
            for (const [v] of near.concat([[top]])) {
                const d = Math.hypot(P[v * 3] - c[0], P[v * 3 + 1] - c[1], P[v * 3 + 2] - c[2]);
                if (d < dist) { dist = d; pick = v; }
            }
            return pick;
        };
        const nipples = [best[1][0], best[-1][0]].map(modeled).map(v => ({ v, near: around(v, 0.012) }));
        // The crotch: the lowest front point of the trunk between the legs, and the midline above it.
        let low = -1;
        for (const v of ids) {
            if (Math.abs(B[v * 3]) > 0.004 || B[v * 3 + 2] < 0) continue;
            if (B[v * 3 + 1] < -0.35 || B[v * 3 + 1] > 0.3) continue;
            if (low < 0 || B[v * 3 + 1] < B[low * 3 + 1]) low = v;
        }
        const crease = ids.filter(v => Math.abs(B[v * 3]) < 0.012 && B[v * 3 + 2] > B[low * 3 + 2] - 0.03 && B[v * 3 + 1] > B[low * 3 + 1] - 0.005 && B[v * 3 + 1] < B[low * 3 + 1] + 0.045)
            .map(v => [v, Math.abs(B[v * 3]) / 0.012, (B[v * 3 + 1] - B[low * 3 + 1]) / 0.045]);
        // The front of the pelvis below the belly: for the mons above the fold and the labia beside it.
        const vulva = ids.filter(v => Math.abs(B[v * 3]) < 0.06 && B[v * 3 + 2] > B[low * 3 + 2] - 0.03 && B[v * 3 + 1] > B[low * 3 + 1] - 0.02 && B[v * 3 + 1] < B[low * 3 + 1] + 0.12)
            .map(v => [v, Math.abs(B[v * 3]), B[v * 3 + 1] - B[low * 3 + 1]]);
        const navel = ids.reduce((best, v) => {
            const distance = i => Math.hypot(B[i * 3], B[i * 3 + 1] - 0.184, B[i * 3 + 2] - 0.136);
            return distance(v) < distance(best) ? v : best;
        }, ids[0]);
        return (pack._anatomyFields = { nipples, low, crease, vulva, navel });
    }

    /** Ordinary abdominal anatomy, present independently of the explicit-detail switch. */
    function navelDetail(pack, P) {
        const v = anatomyFields(pack).navel, B = pack.positions;
        const cx = B[v * 3], cy = B[v * 3 + 1], cz = B[v * 3 + 2];
        for (const i of new Set(pack.body.source)) {
            const x = (B[i * 3] - cx) / 0.008, y = (B[i * 3 + 1] - cy) / 0.012;
            if (Math.abs(x) > 2 || Math.abs(y) > 2 || Math.abs(B[i * 3 + 2] - cz) > 0.025) continue;
            const d = Math.hypot(x, y);
            P[i * 3 + 2] += -0.0028 * Math.exp(-d * d * 2.5) + 0.0007 * Math.exp(-(((d - 1) / 0.32) ** 2));
        }
    }

    /** A vertex's normal on the shaped body, from its own triangles. */
    function normalAt(pack, P, v) {
        if (!pack._faceOf) {
            pack._faceOf = new Map();
            const src = pack.body.source, I = pack.body.index;
            for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) {
                const a = src[I[t + k]];
                if (!pack._faceOf.has(a)) pack._faceOf.set(a, []);
                pack._faceOf.get(a).push([src[I[t]], src[I[t + 1]], src[I[t + 2]]]);
            }
        }
        const n = [0, 0, 0];
        for (const [a, b, c] of pack._faceOf.get(v) || []) {
            const u = [0, 1, 2].map(k => P[b * 3 + k] - P[a * 3 + k]), w = [0, 1, 2].map(k => P[c * 3 + k] - P[a * 3 + k]);
            n[0] += u[1] * w[2] - u[2] * w[1]; n[1] += u[2] * w[0] - u[0] * w[2]; n[2] += u[0] * w[1] - u[1] * w[0];
        }
        const l = Math.hypot(n[0], n[1], n[2]) || 1;
        return [n[0] / l, n[1] / l, n[2] / l];
    }

    /**
     * Reconstruct the skin under a nipple from the surrounding chest. Smoothing the modeled tip in
     * place both shrank its rings and left a second peak beside the new one. A quadratic surface
     * follows the shaped breast/pectoral without retaining that old tip or moving vertices toward
     * whichever neighbor happened to be visited first. Its footprint uses the areola's texture plane;
     * the surface itself is fitted in the current body's plane so skin only moves along its normal.
     */
    function nippleSurface(pack, nip, P) {
        if (!nip.surface) {
            const B = pack.positions, c = Array.from(B.subarray(nip.v * 3, nip.v * 3 + 3));
            const normal = normalAt(pack, B, nip.v);
            const length = Math.hypot(normal[2], normal[0]) || 1;
            const across = [normal[2] / length, 0, -normal[0] / length];
            const up = [normal[1] * across[2], normal[2] * across[0] - normal[0] * across[2], -normal[1] * across[0]];
            const points = [];
            for (const v of new Set(pack.body.source)) {
                const offset = [0, 1, 2].map(k => B[v * 3 + k] - c[k]);
                if (Math.hypot(...offset) > 0.032) continue;
                const x = offset.reduce((s, q, k) => s + q * across[k], 0) / 0.02;
                const y = offset.reduce((s, q, k) => s + q * up[k], 0) / 0.02;
                points.push({ v, distance: Math.hypot(x, y) * 0.02 });
            }
            nip.surface = { points, samples: points.filter(p => p.distance >= 0.008 && p.distance <= 0.016) };
        }
        const { samples } = nip.surface;
        const origin = Array.from(P.subarray(nip.v * 3, nip.v * 3 + 3));
        // Fit in the current skin's plane. Rest-space coordinates contain the original modeled
        // nipple's stretching; fitting all three axes in that space would reconstruct its bulge.
        const facing = [0, 0, 0];
        for (const { v } of samples) {
            const n = normalAt(pack, P, v);
            for (let k = 0; k < 3; k++) facing[k] += n[k];
        }
        const facingLength = Math.hypot(...facing) || 1;
        const n = facing.map(q => q / facingLength), acrossLength = Math.hypot(n[2], n[0]) || 1;
        const across = [n[2] / acrossLength, 0, -n[0] / acrossLength];
        const up = [n[1] * across[2], n[2] * across[0] - n[0] * across[2], -n[1] * across[0]];
        const points = nip.surface.points.map(point => {
            const offset = origin.map((q, k) => P[point.v * 3 + k] - q);
            const x = offset.reduce((s, q, k) => s + q * across[k], 0) / 0.02;
            const y = offset.reduce((s, q, k) => s + q * up[k], 0) / 0.02;
            return { ...point, row: [1, x, y, x * x, x * y, y * y] };
        });
        const matrix = Array.from({ length: 6 }, () => new Float64Array(9));
        for (const { v, row, distance } of points) if (distance >= 0.008 && distance <= 0.016) for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 6; j++) matrix[i][j] += row[i] * row[j];
            for (let k = 0; k < 3; k++) matrix[i][6 + k] += row[i] * (P[v * 3 + k] - origin[k]);
        }
        for (let i = 0; i < 6; i++) {
            let pivot = i;
            for (let j = i + 1; j < 6; j++) if (Math.abs(matrix[j][i]) > Math.abs(matrix[pivot][i])) pivot = j;
            if (Math.abs(matrix[pivot][i]) < 1e-10) return null;
            [matrix[i], matrix[pivot]] = [matrix[pivot], matrix[i]];
            const scale = matrix[i][i];
            for (let j = i; j < 9; j++) matrix[i][j] /= scale;
            for (let j = 0; j < 6; j++) if (j !== i) {
                const factor = matrix[j][i];
                for (let k = i; k < 9; k++) matrix[j][k] -= factor * matrix[i][k];
            }
        }
        const evaluate = row => origin.map((q, k) => q + row.reduce((sum, x, i) => sum + x * matrix[i][6 + k], 0));
        const dx = [0, 1, 2].map(k => matrix[1][6 + k]), dy = [0, 1, 2].map(k => matrix[2][6 + k]);
        const normal = [dx[1] * dy[2] - dx[2] * dy[1], dx[2] * dy[0] - dx[0] * dy[2], dx[0] * dy[1] - dx[1] * dy[0]];
        const length = Math.hypot(...normal) || 1;
        const project = pos => {
            const offset = pos.map((q, k) => q - origin[k]);
            const x = offset.reduce((s, q, k) => s + q * across[k], 0) / 0.02;
            const y = offset.reduce((s, q, k) => s + q * up[k], 0) / 0.02;
            return [1, x, y, x * x, x * y, y * y];
        };
        return { points, evaluate, project, normal: normal.map(q => q / length) };
    }

    /** Nipples raised a little, a woman's crotch given its crease; both in the body's own surface. */
    function anatomyDetail(pack, P, r) {
        const F = anatomyFields(pack), female = sexOf(r) === 'female';
        const height = (female ? 0.0019 : 0.0009) * (r.anatomy.nipple > 0 ? r.anatomy.nippleProjection : 0), tipR = (female ? 0.0045 : 0.003) * Math.max(0.6, Math.sqrt(r.anatomy.nipple));
        for (const nip of F.nipples) {
            const surface = nippleSurface(pack, nip, P);
            if (!surface) continue;
            const n = surface.normal;
            for (const { v, distance: d, row } of surface.points) {
                if (d >= 0.022) continue;
                const base = surface.evaluate(row), blend = 1 - smooth01(0.01, 0.022, d);
                // One broad, rounded tip, with a gentle shoulder into the surrounding skin.
                const areola = (female ? 0.00025 : 0.0001) * (1 - smooth01(0, 0.018, d));
                const column = height * (1 - smooth01(tipR * 0.4, tipR * 1.3, d));
                const lift = areola + column;
                for (let k = 0; k < 3; k++) P[v * 3 + k] += (base[k] - P[v * 3 + k]) * blend + n[k] * lift;
            }
        }
        if (female) for (const [v, x, up] of F.vulva) {
            // The mons: a soft rise over the pubic bone, above the fold.
            const mons = r.anatomy.mons * 0.008 * Math.exp(-(((up - 0.065) / 0.03) ** 2)) * Math.exp(-((x / 0.04) ** 2));
            // The labia: a full ridge either side of the fold along its length, standing forward and a little down.
            const along = Math.sin(Math.min(1, Math.max(0, (up + 0.012) / 0.06)) * Math.PI);
            const labia = r.anatomy.labia * 0.0075 * Math.exp(-(((x - 0.011) / 0.008) ** 2)) * along;
            P[v * 3 + 2] += mons + labia;
            P[v * 3 + 1] -= labia * 0.25;
        }
        if (female) for (const [v, across, up] of F.crease) {
            const depth = 0.0028 * r.anatomy.fold * Math.max(0, 1 - across * across * 4) * Math.sin(Math.min(1, Math.max(0, up)) * Math.PI);
            P[v * 3 + 2] -= depth;
        }
    }

    /**
     * The toes drawn out (or in) along the foot. The skeleton keeps one toe
     * bone per foot, so the toes are found by place, not by weight: the foot's
     * vertices in front of the ball of the foot (that bone's joint) move
     * forward in proportion to how far in front they are, ramping in from
     * the ball, so all five lengthen and the ball stays.
     */
    function toes(pack, P, scale) {
        if (!pack._toeFeet) {
            const footBones = pack.bones.map((b, i) => (/(Foot|ToeBase)$/.test(b.name) ? i : -1)).filter(i => i >= 0);
            const onFoot = new Float32Array(pack.vertexCount);
            for (let v = 0; v < pack.vertexCount; v++) for (let k = 0; k < 4; k++) if (footBones.includes(pack.skinJoints[v * 4 + k])) onFoot[v] += pack.skinWeights[v * 4 + k];
            pack._toeFeet = { onFoot, toes: pack.bones.map((b, i) => (/ToeBase$/.test(b.name) ? i : -1)).filter(i => i >= 0) };
        }
        const T = pack._toeFeet;
        for (const i of T.toes) {
            const head = meanOf(P, pack.bones[i].head), tail = meanOf(P, pack.bones[i].tail);
            const side = pack.bones[i].name.startsWith('Left') ? 1 : -1;
            const d = [tail[0] - head[0], tail[2] - head[2]], l = Math.hypot(d[0], d[1]) || 1;
            d[0] /= l; d[1] /= l;
            // The ball of the foot sits a little behind the middle toe's joint.
            const ball = -0.012;
            for (let v = 0; v < T.onFoot.length; v++) {
                if (T.onFoot[v] < 0.5 || Math.sign(P[v * 3]) !== side) continue;
                const along = (P[v * 3] - head[0]) * d[0] + (P[v * 3 + 2] - head[2]) * d[1] - ball;
                if (along <= 0) continue;
                const ramp = Math.min(1, along / 0.02);
                const push = along * (scale - 1) * ramp * Math.min(1, T.onFoot[v]);
                P[v * 3] += d[0] * push; P[v * 3 + 2] += d[1] * push;
            }
        }
    }

    const smooth01 = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

    /** Shared by the editable base skin and its locally sampled forehead. */
    function cranialRidgeAt(x, y, z, amount) {
        const front = smooth01(-0.6, -0.08, z), band = smooth01(0.03, 0.15, y) * (1 - smooth01(0.88, 1.03, y));
        const width = Math.exp(-Math.pow(x / 0.26, 4)), arch = y + 1.8 * x * x;
        let ribs = 0;
        for (const row of [0.20, 0.34, 0.48, 0.62, 0.76]) ribs += Math.exp(-(((arch - row) / 0.040) ** 2));
        return amount * front * band * width * (0.008 + 0.032 * ribs + 0.035 * Math.exp(-((x / 0.055) ** 2)));
    }

    function foreheadSpoonAt(x, y, z, amount) {
        const radius = Math.hypot(x / 0.070, (y - 0.36) / 0.16);
        const rim = 0.045 * Math.exp(-(((radius - 1) / 0.23) ** 2));
        const bowl = -0.012 * Math.exp(-((radius / 0.75) ** 4));
        const stem = 0.024 * Math.exp(-((x / 0.035) ** 2)) * smooth01(0.01, 0.10, y) * (1 - smooth01(0.20, 0.32, y));
        return amount * smooth01(-0.55, -0.05, z) * (rim + bowl + stem);
    }

    /** Connected bridge chevrons and central brow folds, sampled by the refined skin too. */
    function noseFoldAt(x, y, z, amount) {
        if (!amount) return 0;
        const front = smooth01(-0.1, 0.10, z), width = Math.abs(x);
        let folds = 0;
        // Nested chevrons over the bridge and tip, then softer transverse
        // folds between the frontal lobes. Eyelids are excluded by the caller.
        for (let k = 0; k < 4; k++) {
            const line = -0.08 - k * 0.065 + width * 0.48;
            const taper = Math.exp(-((width / (0.11 + k * 0.025)) ** 6));
            folds += taper * (0.018 * Math.exp(-(((y - line) / 0.016) ** 2)) - 0.006 * Math.exp(-(((y - line + 0.021) / 0.013) ** 2)));
        }
        for (let k = 0; k < 4; k++) {
            const line = 0.10 + k * 0.07 + 0.07 * Math.exp(-((x / 0.24) ** 2));
            folds += Math.exp(-((x / (0.43 - k * 0.035)) ** 6)) * (0.014 * Math.exp(-(((y - line) / 0.02) ** 2)) - 0.004 * Math.exp(-(((y - line + 0.028) / 0.016) ** 2)));
        }
        return folds * amount * front;
    }

    /** Head morphs measured against the shaped eyes, head pivot and crown. */
    function morph(pack, P, r) {
        const m = r.morph, size = r.headSize;
        if (m.toes !== 1) toes(pack, P, m.toes);
        eyes(pack, P, r.shapes.eyeSize, m.eyeWide, m.eyeTall);
        if (m.eyeSocket) eyeSockets(pack, P, m.eyeSocket);
        if (r.anatomy.detail) anatomyDetail(pack, P, r);
        if (size === 1 && !m.snout && !m.flat && !m.earsAway && !m.muzzle && !m.noseFolds && !m.cranialRidges && !m.cranialLobes && !m.earBowls && !m.foreheadSpoon && !m.facialRidges && !m.neckWebbing) return;
        const F = headFields(pack);
        const h = meanOf(P, pack.bones[F.head].head);
        let crown = -Infinity;
        for (let v = 0; v < F.w.length; v++) if (F.w[v] > 0.9 && P[v * 3 + 1] > crown) crown = P[v * 3 + 1];
        const eye = meanOf(P, F.eyeIds);
        const H = crown - h[1];
        const forehead = crown - eye[1];
        if (m.cranialRidges || m.foreheadSpoon || m.noseFolds) {
            const eyes = new Set(F.eyeIds);
            // A central keel and five paired, upward-arching ribs. Their tips
            // descend toward the temples; the crest continues to the hairline.
            // Move existing skin so the ridges share its expressions, skinning and UVs.
            for (let v = 0; v < F.w.length; v++) {
                if (F.w[v] < 0.5 || F.ear[v] > 0.1 || eyes.has(v)) continue;
                const x = P[v * 3] / H, y = (P[v * 3 + 1] - eye[1]) / forehead, z = (P[v * 3 + 2] - eye[2]) / H;
                P[v * 3 + 2] += H * (cranialRidgeAt(x, y, z, m.cranialRidges) + foreheadSpoonAt(x, y, z, m.foreheadSpoon) + noseFoldAt(x, (P[v * 3 + 1] - eye[1]) / H, z, m.noseFolds));
            }
        }
        if (m.facialRidges) {
            const eyes = new Set(F.eyeIds);
            for (let v = 0; v < F.w.length; v++) {
                if (F.w[v] < 0.8 || F.ear[v] > 0.3 || eyes.has(v)) continue;
                const x = Math.abs(P[v * 3]) / H, y = (P[v * 3 + 1] - eye[1]) / H, z = (P[v * 3 + 2] - eye[2]) / H;
                const orbit = Math.hypot((x - 0.21) / 0.17, (y + 0.035) / 0.15);
                const rim = Math.exp(-(((orbit - 1.35) / 0.23) ** 2)) * smooth01(0.08, 0.18, x);
                const temple = Math.exp(-(((x - 0.42 - y * 0.14) / 0.065) ** 2)) * smooth01(-0.42, -0.25, y) * (1 - smooth01(0.20, 0.38, y));
                const front = smooth01(-0.5, -0.10, z);
                P[v * 3 + 2] += H * m.facialRidges * front * (rim * 0.035 + temple * 0.05);
            }
        }
        if (m.neckWebbing) {
            // The Head pivot sits inside the face, above the chin. Stop below
            // the jaw instead of fanning the cheeks out with the neck.
            const neck = meanOf(P, pack.bones.find(b => b.name === 'Neck').head);
            const bottom = neck[1] - H * 0.18, top = neck[1] + (h[1] - neck[1]) * 0.64, length = top - bottom;
            const field = new Float32Array(P.length);
            if (length > 1e-5) for (let v = 0; v < F.w.length; v++) {
                const t = (P[v * 3 + 1] - bottom) / length;
                if (t <= 0 || t >= 1) continue;
                const x = P[v * 3], z = P[v * 3 + 2] - (neck[2] + (h[2] - neck[2]) * t);
                if (Math.abs(x) > H * 0.65 || Math.abs(z) > H * 0.6) continue;
                const side = smooth01(H * 0.07, H * 0.22, Math.abs(x));
                // A broad membrane between the lower jaw and clavicle. The old short
                // sinusoidal field made a rounded collar with a ledge under the chin.
                const fan = smooth01(0, 0.35, t) * (1 - smooth01(0.62, 1, t));
                const flank = 1 - smooth01(H * 0.18, H * 0.5, Math.abs(z));
                field[v * 3] = Math.sign(x) * H * 0.115 * m.neckWebbing * fan * side * flank;
            }
            const eased = relax(pack, field, 8);
            for (let i = 0; i < P.length; i++) P[i] += eased[i];
        }
        if (m.cranialLobes) {
            const eyes = new Set(F.eyeIds);
            // Two rounded frontal bosses above a continuous brow shelf, with
            // a shallow central crown cleft. Keep the eyelids and eyes intact.
            for (let v = 0; v < F.w.length; v++) {
                if (F.w[v] < 0.5 || F.ear[v] > 0.1 || eyes.has(v)) continue;
                const x = P[v * 3] / H, y = (P[v * 3 + 1] - eye[1]) / forehead, z = (P[v * 3 + 2] - eye[2]) / H;
                const front = smooth01(-0.65, -0.12, z), band = smooth01(0.015, 0.10, y);
                const lobes = Math.exp(-(((Math.abs(x) - 0.23) / 0.17) ** 2) - ((y - 0.66) / 0.29) ** 2);
                const shelf = Math.exp(-(((y - 0.15 - Math.abs(x) * 0.28) / 0.11) ** 2)) * Math.exp(-((x / 0.55) ** 6));
                P[v * 3 + 2] += H * m.cranialLobes * front * band * (0.15 * lobes + 0.04 * shelf);
                const top = smooth01(0.65, 0.98, y) * smooth01(-0.9, -0.3, z);
                P[v * 3 + 1] += H * m.cranialLobes * top * (0.08 * Math.exp(-(((Math.abs(x) - 0.25) / 0.16) ** 2)) - 0.06 * Math.exp(-((x / 0.12) ** 2)));
            }
        }
        if (m.earBowls) {
            const mask = earMask(pack);
            const field = new Float32Array(P.length);
            // Open each pinna toward the front and expand about its attachment,
            // preserving the ear's existing rim, concha and lobe topology.
            for (const side of [-1, 1]) {
                const own = [];
                for (let v = 0; v < F.w.length; v++) if (mask[v] > 0.65 && Math.sign(P[v * 3]) === side) own.push(v);
                if (!own.length) continue;
                const rootX = Math.min(...own.map(v => Math.abs(P[v * 3])));
                const rootZ = Math.max(...own.map(v => P[v * 3 + 2]));
                const centerY = meanOf(P, own)[1];
                // Broad, forward-facing bowls: opening the ear must keep
                // increasing its span, rather than rotating it edge-on again.
                const angle = Math.min(1.12, m.earBowls * 0.78), c = Math.cos(angle), s = Math.sin(angle);
                for (let v = 0; v < F.w.length; v++) {
                    if (mask[v] <= 0 || F.w[v] < 0.5 || Math.sign(P[v * 3]) !== side) continue;
                    const w = mask[v], u = Math.abs(P[v * 3]) - rootX, z = P[v * 3 + 2] - rootZ;
                    const x = rootX + (u * c - z * s) * (1 + 0.60 * m.earBowls);
                    const depth = rootZ + (u * s + z * c) * (1 - 0.16 * m.earBowls);
                    const tuck = H * 0.19 * Math.min(1, m.earBowls);
                    field[v * 3] = (side * (x - tuck) - P[v * 3]) * w;
                    field[v * 3 + 1] = ((P[v * 3 + 1] - centerY) * 0.46 + H * 0.06) * m.earBowls * w;
                    field[v * 3 + 2] = (depth - P[v * 3 + 2]) * w;
                }
            }
            const eased = relax(pack, field, 3);
            for (let i = 0; i < P.length; i++) P[i] += eased[i];
        }
        if (m.earsAway) {
            // The ear drawn in as a membrane over its root: its skin settles where the head's would be
            // without it (each vertex at the mean of its neighbors, the head round it held), so the
            // skin closes over the ear smooth, with no gathered creases running into the head.
            const mask = earMask(pack), { offsets, flat } = neighbors(pack);
            const own = new Float32Array(F.w.length), free = [];
            for (let v = 0; v < F.w.length; v++) {
                // The outer ear and its root; not the cheek and temple the ear-size target also carries.
                own[v] = mask[v] > 0.02 || F.ear[v] > 0.6 ? Math.max(F.ear[v], mask[v]) : 0;
                if (own[v] > 0.02 && F.w[v] > 0.5) free.push(v);
            }
            const Q = Float32Array.from(P);
            for (let pass = 0; pass < 140; pass++) for (const v of free) {
                const s0 = offsets[v], s1 = offsets[v + 1];
                if (s1 === s0) continue;
                let x = 0, y = 0, z = 0;
                for (let i = s0; i < s1; i++) { const u = flat[i] * 3; x += Q[u]; y += Q[u + 1]; z += Q[u + 2]; }
                const k = 1 / (s1 - s0);
                Q[v * 3] = x * k; Q[v * 3 + 1] = y * k; Q[v * 3 + 2] = z * k;
            }
            for (const side of [1, -1]) {
                // The membrane spans the root flat; the skull rounds out over it a little.
                let c = [0, 0, 0], n = 0, reach = 0;
                for (const v of free) if (own[v] > 0.6 && Math.sign(P[v * 3]) === side) { c[0] += Q[v * 3]; c[1] += Q[v * 3 + 1]; c[2] += Q[v * 3 + 2]; n++; }
                if (!n) continue;
                c = c.map(x => x / n);
                for (const v of free) if (Math.sign(P[v * 3]) === side) reach = Math.max(reach, Math.hypot(Q[v * 3 + 1] - c[1], Q[v * 3 + 2] - c[2]));
                for (const v of free) {
                    if (Math.sign(P[v * 3]) !== side) continue;
                    const d = Math.hypot(Q[v * 3 + 1] - c[1], Q[v * 3 + 2] - c[2]) / (reach || 1);
                    Q[v * 3] += side * 0.002 * Math.max(0, 1 - d * d);
                    const e = Math.min(1, own[v] * 1.5) * m.earsAway;
                    for (let k = 0; k < 3; k++) P[v * 3 + k] += (Q[v * 3 + k] - P[v * 3 + k]) * e;
                }
                // With the ear gone, an ear hole: a pit in the side of the head, as wide as asked.
                if (m.earsAway > 0.6 && m.earHoles > 0) {
                    const r = 0.004 + 0.007 * m.earHoles, depth = (0.004 + 0.006 * m.earHoles) * (m.earsAway - 0.6) / 0.4;
                    for (let v = 0; v < F.w.length; v++) {
                        if (F.w[v] < 0.5 || Math.sign(P[v * 3]) !== side) continue;
                        const d = Math.hypot(P[v * 3 + 1] - c[1], P[v * 3 + 2] - c[2]);
                        if (d > r || Math.abs(P[v * 3] - c[0]) > 0.03) continue;
                        P[v * 3] -= side * depth * (1 - (d / r) ** 2);
                    }
                }
            }
        }
        if (m.snout || m.flat || m.muzzle) {
            // The face below the eyes and in front of them: the mouth, the nose, the jaw.
            // From under the chin (about 0.62 of the head's height below the eyes) up to just under the eyes.
            const top = eye[1] - H * 0.02, bottom = eye[1] - H * 0.66, back = eye[2] - H * 0.42;
            const mouth = meanOf(P, pack.helpers.upperTeeth.source);
            let teethFront = -Infinity, mouthHalf = 0;
            for (const v of pack.helpers.upperTeeth.source) { teethFront = Math.max(teethFront, P[v * 3 + 2]); mouthHalf = Math.max(mouthHalf, Math.abs(P[v * 3])); }
            const eyeAt = [1, -1].map(sd => meanOf(P, F.eyeIds.filter(v => Math.sign(P[v * 3]) === sd)));
            let R = 0;
            for (const v of F.eyeIds) { const c = eyeAt[P[v * 3] > 0 ? 0 : 1]; R = Math.max(R, Math.abs(P[v * 3] - c[0])); }
            // A snout is the face stretched forward, not slid: the further forward a point lies (the nose,
            // the lips) the further it goes, so the muzzle tapers from the cheeks to its tip. Its top
            // slopes down from the stop under the brow to the nose, it narrows (more at the top), and the
            // lower jaw comes most of the way.
            const len = m.snout * H * 0.75, zb = eye[2] - H * 0.3, zf = eye[2] + H * 0.1;
            for (let v = 0; v < F.w.length; v++) {
                const w = F.w[v];
                if (w <= 0) continue;
                const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
                const vert = smooth01(bottom - H * 0.12, bottom + H * 0.12, y) * (1 - smooth01(top - H * 0.16, top + H * 0.04, y));
                const f = vert * smooth01(back, eye[2] - H * 0.1, z) * w;
                const c = eyeAt[x > 0 ? 0 : 1], de = Math.hypot(x - c[0], y - c[1], z - c[2]);
                // The eyes and the skin round them stay, so lids and sockets keep their fit.
                if (f && m.flat) P[v * 3 + 2] -= m.flat * f * Math.max(0, z - back) * 0.35 * smooth01(R * 1.3, R * 3.2, de);
                if (!m.snout && !m.muzzle) continue;
                const low = smooth01(bottom - H * 0.12, bottom + H * 0.12, y), up = 1 - smooth01(eye[1] - H * 0.16, eye[1] + H * 0.03, y);
                const s = low * up * smooth01(zb, zf, z) * smooth01(R * 1.15, R * 2.6, de) * w;
                if (!s) continue;
                const above = smooth01(mouth[1] - H * 0.02, eye[1], y), jaw = 1 - 0.15 * smooth01(mouth[1], mouth[1] - H * 0.1, y);
                P[v * 3 + 2] += len * s * jaw;
                P[v * 3 + 1] -= len * s * (0.18 * above + 0.04);
                P[v * 3] = x * (1 - (m.muzzle * 0.36 + m.snout * 0.1 + m.snout * 0.16 * above) * s);
            }
            if (m.flat) {
                // A flat face's lips settle into it: the skin in front of the teeth drawn to where the face
                // round it would run (each vertex at its neighbors' mean, the face round it held), leaving
                // only the line where they meet.
                const { offsets, flat } = neighbors(pack), lipW = new Map();
                for (let v = 0; v < F.w.length; v++) {
                    if (F.w[v] < 0.5 || P[v * 3 + 2] < teethFront - 0.002) continue;
                    const d = Math.hypot(P[v * 3] / (mouthHalf * 1.4), (P[v * 3 + 1] - mouth[1] + H * 0.06) / (H * 0.19));
                    if (d < 1) lipW.set(v, 1 - d);
                }
                const Q = Float32Array.from(P);
                for (let pass = 0; pass < 60; pass++) for (const v of lipW.keys()) {
                    const s0 = offsets[v], s1 = offsets[v + 1];
                    if (s1 === s0) continue;
                    let x = 0, y = 0, z = 0;
                    for (let i = s0; i < s1; i++) { const u = flat[i] * 3; x += Q[u]; y += Q[u + 1]; z += Q[u + 2]; }
                    const k = 1 / (s1 - s0);
                    Q[v * 3] = x * k; Q[v * 3 + 1] = y * k; Q[v * 3 + 2] = z * k;
                }
                const amount = Math.min(1, m.flat * 1.8);
                for (const [v, wl] of lipW) { const t = Math.min(1, wl * 3) * amount; for (let k = 0; k < 3; k++) P[v * 3 + k] += (Q[v * 3 + k] - P[v * 3 + k]) * t; }
            }
        }
        if (size !== 1) {
            for (let v = 0; v < F.w.length; v++) {
                const w = F.w[v];
                if (!w) continue;
                for (let k = 0; k < 3; k++) P[v * 3 + k] = h[k] + (P[v * 3 + k] - h[k]) * (1 + (size - 1) * w);
            }
        }
    }

    const meanOf = (positions, list) => {
        let x = 0, y = 0, z = 0;
        for (const v of list) { x += positions[v * 3]; y += positions[v * 3 + 1]; z += positions[v * 3 + 2]; }
        const n = list.length || 1;
        return [x / n, y / n, z / n];
    };

    /** Each bone's head (and tail) on the shaped body. */
    function joints(pack, positions) {
        return pack.bones.map(b => ({ name: b.name, parent: b.parent, head: meanOf(positions, b.head), tail: meanOf(positions, b.tail) }));
    }

    /** The lowest point of the body faces: the soles. */
    function floorOf(pack, positions) {
        let min = Infinity;
        const src = pack.body.source;
        for (let i = 0; i < src.length; i++) min = Math.min(min, positions[src[i] * 3 + 1]);
        return min;
    }

    /** A fitted piece's vertices: each rides on three base vertices plus a scaled offset. */
    function fit(piece, positions) {
        const axisScale = axis => {
            const [a, b, dist] = piece.scale[axis];
            const k = 'xyz'.indexOf(axis);
            return Math.abs(positions[a * 3 + k] - positions[b * 3 + k]) / (dist || 1);
        };
        const sx = axisScale('x'), sy = axisScale('y'), sz = axisScale('z');
        const count = piece.refs.length / 3;
        const out = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            for (let k = 0; k < 3; k++) {
                const v = piece.refs[i * 3 + k] * 3, w = piece.weights[i * 3 + k];
                out[i * 3] += positions[v] * w; out[i * 3 + 1] += positions[v + 1] * w; out[i * 3 + 2] += positions[v + 2] * w;
            }
            out[i * 3] += piece.offsets[i * 3] * sx;
            out[i * 3 + 1] += piece.offsets[i * 3 + 1] * sy;
            out[i * 3 + 2] += piece.offsets[i * 3 + 2] * sz;
        }
        return out;
    }

    /** A fitted piece's skin: the influences of the base vertex it leans on most. */
    function fittedSkin(pack, piece) {
        const count = piece.refs.length / 3;
        const joints4 = new Uint8Array(count * 4), weights4 = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
            let best = 0;
            for (let k = 1; k < 3; k++) if (piece.weights[i * 3 + k] > piece.weights[i * 3 + best]) best = k;
            const v = piece.refs[i * 3 + best];
            joints4.set(pack.skinJoints.subarray(v * 4, v * 4 + 4), i * 4);
            weights4.set(pack.skinWeights.subarray(v * 4, v * 4 + 4), i * 4);
        }
        return { joints: joints4, weights: weights4 };
    }

    /**
     * Smooth normals per source vertex (so UV seams do not crease), handed to
     * each render vertex. `source` maps render vertices to source vertices.
     */
    function normals(positions, source, index, sourceCount) {
        const acc = new Float32Array(sourceCount * 3);
        const p = i => source[i] * 3;
        for (let t = 0; t < index.length; t += 3) {
            const a = p(index[t]), b = p(index[t + 1]), c = p(index[t + 2]);
            const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
            const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            for (const s of [a, b, c]) { acc[s] += nx; acc[s + 1] += ny; acc[s + 2] += nz; }
        }
        const out = new Float32Array(source.length * 3);
        for (let i = 0; i < source.length; i++) {
            const s = source[i] * 3;
            const len = Math.hypot(acc[s], acc[s + 1], acc[s + 2]) || 1;
            out[i * 3] = acc[s] / len; out[i * 3 + 1] = acc[s + 1] / len; out[i * 3 + 2] = acc[s + 2] / len;
        }
        return out;
    }

    /** Smooth normals of every pack vertex over the body faces (vertices off the body get none). */
    function vertexNormals(pack, positions) {
        const n = new Float32Array(pack.vertexCount * 3);
        const src = pack.body.source, index = pack.body.index;
        for (let t = 0; t < index.length; t += 3) {
            const a = src[index[t]] * 3, b = src[index[t + 1]] * 3, c = src[index[t + 2]] * 3;
            const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
            const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            for (const s of [a, b, c]) { n[s] += nx; n[s + 1] += ny; n[s + 2] += nz; }
        }
        for (let i = 0; i < n.length; i += 3) {
            const l = Math.hypot(n[i], n[i + 1], n[i + 2]);
            if (l > 0) { n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
        }
        return n;
    }

    /**
     * The eyeballs' own shade (linear vertex colors, 1 lit): the white darkens
     * up under the upper lid and toward the corners, a little under the lower
     * lid, as the lids and the socket shade a living eye.
     */
    function eyeShade(V) {
        const n = V.length / 3, out = new Float32Array(n * 3).fill(1);
        for (const side of [1, -1]) {
            const own = [];
            for (let i = 0; i < n; i++) if (Math.sign(V[i * 3]) === side) own.push(i);
            if (!own.length) continue;
            const c = meanOf(V, own);
            let R = 0;
            for (const i of own) R = Math.max(R, Math.abs(V[i * 3] - c[0]));
            for (const i of own) {
                const dy = (V[i * 3 + 1] - c[1]) / R, dx = Math.abs(V[i * 3] - c[0]) / R;
                const k = (1 - 0.38 * smooth01(0.05, 0.8, dy)) * (1 - 0.3 * smooth01(0.45, 0.95, dx)) * (1 - 0.15 * smooth01(0.3, 0.9, -dy));
                out[i * 3] = k; out[i * 3 + 1] = k * 0.98; out[i * 3 + 2] = k * 0.97;
            }
        }
        return out;
    }

    /** Render-vertex attribute from a per-source one. */
    function gather(values, source, size) {
        const out = new values.constructor(source.length * size);
        for (let i = 0; i < source.length; i++) for (let k = 0; k < size; k++) out[i * size + k] = values[source[i] * size + k];
        return out;
    }

    /**
     * Everything a viewer or exporter needs for one recipe, floor at y = 0:
     * { parts: [{name, positions, normals, uvs, index, joints, weights, texture}], bones: [{name, parent, head}], height }
     */
    function build(pack, recipe) {
        const shaped = shape(pack, recipe);
        const floor = floorOf(pack, shaped);
        for (let i = 1; i < shaped.length; i += 3) shaped[i] -= floor;
        const body = pack.body;
        const parts = [{
            name: 'Body',
            positions: gather(shaped, body.source, 3),
            normals: normals(shaped, body.source, body.index, pack.vertexCount),
            uvs: body.uv,
            index: body.index,
            joints: gather(pack.skinJoints, body.source, 4),
            weights: gather(pack.skinWeights, body.source, 4)
        }];
        const eyes = pack.eyes;
        const eyeVerts = fit(eyes, shaped);
        const eyeSkin = fittedSkin(pack, eyes);
        parts.push({
            name: 'Eyes',
            positions: gather(eyeVerts, eyes.source, 3),
            normals: normals(eyeVerts, eyes.source, eyes.index, eyeVerts.length / 3),
            uvs: eyes.uv,
            index: eyes.index,
            joints: gather(eyeSkin.joints, eyes.source, 4),
            weights: gather(eyeSkin.weights, eyes.source, 4),
            texture: eyes.texture,
            colors: gather(eyeShade(eyeVerts), eyes.source, 3),
            keepColors: true
        });
        const bones = joints(pack, shaped);
        let top = 0;
        for (let i = 1; i < parts[0].positions.length; i += 3) top = Math.max(top, parts[0].positions[i]);
        // `shaped` (every pack vertex, helpers included, floor at 0) is what garments and hair are built on.
        return { parts, bones, height: top, shaped };
    }

    /** A seeded random recipe within per-field ranges ({gender:[0,1], age:[18,60], ...}). */
    function randomRecipe(seed, ranges) {
        let s = (seed >>> 0) || 1;
        const rand = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
        const R = Object.assign({ gender: [0, 1], age: [18, 70], muscle: [0.2, 0.8], weight: [0.2, 0.8], height: [0.25, 0.75], cup: [0.3, 0.7], proportions: [0.4, 0.95], shapes: [-0.6, 0.6] }, ranges || {});
        const pick = ([lo, hi]) => lo + (hi - lo) * rand();
        const gender = rand() < 0.5 ? pick([0, 0.15]) : pick([0.85, 1]);
        const r = {
            gender: R.gender[0] === 0 && R.gender[1] === 1 ? gender : pick(R.gender),
            age: pick(R.age), muscle: pick(R.muscle), weight: pick(R.weight), height: pick(R.height), cup: pick(R.cup), proportions: pick(R.proportions),
            shapes: {}
        };
        // One of the world's peoples, its blend nudged a little and a skin tone from its own range.
        const people = PEOPLES[Math.floor(rand() * PEOPLES.length)];
        r.ancestry = { people: people.id };
        for (const a of ANCESTRY) r.ancestry[a] = Math.max(0, people.mix[a] + (rand() - 0.5) * 0.12);
        for (const s of SLIDERS) {
            if (!s.basic && rand() < 0.6) continue;
            r.shapes[s.key] = s.paired ? pick(R.shapes) * (s.key === 'belly' ? Math.max(0, r.weight - 0.3) * 1.5 : 1) : Math.max(0, pick(R.shapes)) * 0.5;
        }
        r.shapes.earsPointed = 0;
        // A random face is never gaunt: hollow cheeks and a thin face are a choice, not a chance.
        for (const k of ['headFat', 'cheeks']) if (r.shapes[k] != null) r.shapes[k] = Math.max(-0.15, r.shapes[k]);
        const tones = people.tones;
        const t = rand() * (tones.length - 1), i = Math.floor(t), f = t - i;
        r.skin = mix(tones[i], tones[Math.min(i + 1, tones.length - 1)], f);
        r.seed = seed >>> 0;
        return normalizeRecipe(r);
    }

    function mix(a, b, f) {
        const ca = parseInt(a.slice(1), 16), cb = parseInt(b.slice(1), 16);
        const ch = k => Math.round(((ca >> k) & 255) * (1 - f) + ((cb >> k) & 255) * f);
        return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
    }

    const api = { PEOPLES, PEOPLE_BY_ID, withPeople, irisFor, earMask, noseFoldAt, cranialRidgeAt, foreheadSpoonAt, almondEye: { frame: almondFrame, half: almondHalf, at: almondAt }, VOLUME, maskOf, fatMask, volume, sexOf, anatomyFields, nippleSurface, MORPHS, morph, headFields, vertexNormals, gather, normals, fittedSkin, naturalRecipe, neighbors, relax, SLIDERS, SHAPES, SLIDER_BY_KEY, MACRO_RANGES, ANCESTRY, DEFAULT_RECIPE, MIN_AGE, MAX_AGE, DATA_PATH, dataFolder, normalizeRecipe, targetWeights, openPack, loadPack, shape, joints, fit, build, randomRecipe };
    root.RRHumanBody = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
