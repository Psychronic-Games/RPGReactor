/**
 * RRCharacterGroups - Forge › 3D Character Builder › Group: many characters made at once to one description, for a
 * town, an army or a people with its own look. The author says who may appear (species, how many women, ages, builds,
 * settings to dress from, colours, how often an accessory), how many, and what to make of each (a saved design, a
 * walking sheet, a side-view battler, a portrait); the builder makes them one after another on its own view.
 *
 *   DEFAULT, THEMES            a new group's description, and the settings an outfit can come from
 *   normalize(spec)            a description made whole and held to its limits
 *   member(spec, index, base)  member `index`'s recipe: the same for the same description and seed, whatever the
 *                              count. `base` is the character open in the builder, for what a group keeps from it.
 *   members(spec, base)        all of them, as [{ name, recipe }]
 *   memberName(spec, index)    "Guards 03"
 *   faceSheets(count)          how a group's portraits are laid out: eight to an MZ face sheet
 *   openPanel(builder)         the panel over the builder's view
 *
 * A group's members are the standard random character (RRCharacterModel.random) for a seed of their own, then held to
 * the description: the species, gender and setting are chosen from what is ticked, age and build are placed within
 * their ranges, and the outfit, the accessories or both can be the open character's, so an army wears one uniform on
 * forty different people. Nothing here draws: the sheets are RRCharacterSpriteSheet's, the thumbnails the builder's.
 */
(function(root) {
    'use strict';
    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Model = () => need('RRCharacterModel', './CharacterModel.js');
    const Species = () => need('RRCharacterSpecies', './CharacterSpecies.js');
    const Body = () => need('RRHumanBody', './HumanBody.js');

    const THEMES = ['Everyday', 'Fantasy', 'Armor', 'Sci-fi', 'Wasteland', 'Cyberpunk'];
    const MOST = 200;
    const MOST_COLOURS = 6;
    const DEFAULT = {
        name: 'Villagers', count: 12, seed: 1,
        species: ['human'], female: 50, age: [18, 65], height: [0, 1], weight: [0, 1], muscle: [0, 1],
        shares: {}, skin: [], hairColours: [], eyeColours: [],
        themes: ['Everyday'], keepOutfit: false, keepProps: false, accessories: 50, palette: [],
        designs: true, walk: true, walkLayout: 'mz', walkFrame: 48, walkFrames: 3, sv: false, svFrame: 64, faces: true, faceFrame: 144,
        style: 'realistic', look: 'smooth', outline: true,
        // The sprite view's own choices, for every member's sheets: the walking sheet's camera, the drawn look's
        // colours, the shadow, and what a portrait is (one face each on a shared sheet, or a face set each).
        walkAngle: 30, colors: 12, shadow: false, shadowAngle: 30, shadowDistance: 100,
        faceKind: 'one', facePreset: 'everyday', faceFrames: 1, faceHold: 'talk', faceView: 'three',
        // The catalog's choices. `outfits`: the whole outfits a character may wear (none ticked: every outfit of
        // `themes`). `pieces`: garments that take their kind's place in the outfit, one of the ticked of each kind.
        // `gear`: the accessories characters may wear, `gearMost` at most each. `cyberLimbs`: the limbs that may be
        // cybernetic, on `cyberLimbShare` percent of the characters. `models`: a 3D model of each.
        // (The battlers' own look, `sv…`: each kind of sprite is drawn its own way. Unsaid, it is the walking sprites'.)
        // `extreme`: height, weight and muscle may go as far as the builder's Extreme proportions carries them.
        // `anatomy`: every character is built with the builder's Anatomical detail.
        // `ranges`: any other slider of the builder's Body and Face tabs held between two values, by its place in the
        // recipe ('cup', 'shapes.hips'); one not named is left as the character rolled it.
        extreme: false, anatomy: false, ranges: {},
        outfits: [], pieces: [], gear: [], gearMost: 2, cyberLimbs: [], cyberLimbShare: 50, models: false
    };

    const Wardrobe = () => need('RRCharacterWardrobe', './CharacterWardrobe.js');
    const Props = () => need('RRCharacterProps', './CharacterProps.js');
    const BodyArt = () => need('RRCharacterBodyArt', './CharacterBodyArt.js');
    /** The outfits a character of the group may wear: the ticked ones, or every outfit of the group's settings. */
    function outfitPool(spec) {
        const W = Wardrobe(), all = W ? W.PRESETS.filter(p => p.items.length) : [];
        const ticked = all.filter(p => (spec.outfits || []).includes(p.id));
        return (ticked.length ? ticked : all.filter(p => (spec.themes || []).includes(p.group))).map(p => p.id);
    }
    /** What a garment's kind is called in the catalog, in the order the kinds are shown. */
    const PIECE_KINDS = [['top', 'Tops'], ['bottom', 'Trousers and skirts'], ['dress', 'Dresses and one-piece outfits'], ['over', 'Jackets and coats'], ['cloak', 'Cloaks'], ['wrap', 'Wraps'], ['feet', 'Shoes and boots'], ['hands', 'Gloves'], ['head', 'Headwear'], ['face', 'Face coverings'], ['eyes', 'Eyewear'], ['neck', 'Neckwear'], ['waist', 'Belts'], ['wrists', 'Wrists'], ['chestRig', 'Chest rigs'], ['armor', 'Body armor'], ['mail', 'Mail'], ['shoulders', 'Shoulder armor'], ['hips', 'Hip armor'], ['legarmor', 'Leg armor'], ['under', 'Underlayers'], ['underwearTop', 'Underwear tops'], ['underwearBottom', 'Underwear bottoms'], ['hosiery', 'Hosiery']];

    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const number = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
    /** A range as [low, high] within [lo, hi], low first. */
    function range(value, fallback, lo, hi) {
        const a = clamp(number(Array.isArray(value) ? value[0] : undefined, fallback[0]), lo, hi), b = clamp(number(Array.isArray(value) ? value[1] : undefined, fallback[1]), lo, hi);
        return a <= b ? [a, b] : [b, a];
    }

    /** The species a group may hold: humanoids with a body of the usual kind (a slime or a centaur is made on its own page). */
    function speciesChoices() {
        const S = Species();
        return (S ? S.SPECIES : [{ id: 'human', label: 'Human', group: 'Common' }]).filter(s => !['slimefolk', 'centaur', 'merfolk'].includes(s.id));
    }

    /** How far a build slider goes: 0 to 1, or with Extreme proportions as far as the builder's own Extreme. */
    function buildLimits(key, extreme) {
        const M = Body() && Body().MACRO_RANGES, far = extreme && M && M[key] && M[key].extreme;
        return far ? [far[0], far[1]] : [0, 1];
    }

    /**
     * The builder's sliders a group can hold to a range, in the builder's sections and order: `{ key, label, natural,
     * extreme }`, the key its place in the recipe. (Age, height, weight and muscle are the group's own rows.)
     */
    function rangeCatalog() {
        const B = Body(), M = (B && B.MACRO_RANGES) || {}, macro = (key, label) => ({ key, label, natural: M[key] ? M[key].natural : [0, 1], extreme: M[key] ? M[key].extreme : [0, 1] });
        const shapes = section => ((B && B.SLIDERS) || []).filter(x => x.section === section).map(x => ({ key: 'shapes.' + x.key, label: x.label, natural: x.paired ? [-1, 1] : [0, 1], extreme: x.paired ? [-x.extreme, x.extreme] : [0, x.extreme] }));
        const body = [
            { section: 'Build', items: [macro('proportions', 'Proportions'), { key: 'headSize', label: 'Head size', natural: [0.8, 1.25], extreme: [0.5, 2.2] }, macro('fatBounce', 'Fat bounce')] },
            { section: 'Proportions', items: shapes('Proportions') },
            { section: 'Torso', items: shapes('Torso').concat([macro('buttBounce', 'Butt bounce')]) },
            { section: 'Bust', items: [macro('cup', 'Bust size'), macro('firmness', 'Firmness'), macro('bustBounce', 'Bust bounce')].concat(shapes('Bust')) },
            { section: 'Arms and legs', items: shapes('Arms and legs') }
        ];
        const face = ['Head and neck', 'Head shape', 'Forehead and brows', 'Eyes', 'Nose', 'Mouth and jaw', 'Ears'].map(section => ({ section, items: shapes(section) }));
        return { body, face };
    }
    const rangeItems = () => { const c = rangeCatalog(); return c.body.concat(c.face).flatMap(group => group.items); };

    function normalize(spec) {
        const s = Object.assign({}, DEFAULT, spec || {});
        const known = new Set(speciesChoices().map(x => x.id)), minAge = Math.max(18, (Body() && Body().MIN_AGE) || 18), maxAge = (Body() && Body().MAX_AGE) || 90;
        const species = (Array.isArray(s.species) ? s.species : []).filter(id => known.has(id));
        const themes = (Array.isArray(s.themes) ? s.themes : []).filter(t => THEMES.includes(t));
        const colours = list => (Array.isArray(list) ? list : []).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, MOST_COLOURS);
        // Catalog ids, each once, only ones the catalog has.
        const ids = (list, have) => [...new Set((Array.isArray(list) ? list : []).filter(id => typeof id === 'string' && have && have.has(id)))];
        // How many of a species to each one of the others: whole numbers, 1 unless said.
        const shares = {};
        for (const id of species) { const n = clamp(Math.round(number(s.shares && s.shares[id], 1)), 1, 9); if (n !== 1) shares[id] = n; }
        return {
            name: String(s.name || '').trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').slice(0, 40) || DEFAULT.name,
            count: clamp(Math.round(number(s.count, DEFAULT.count)), 1, MOST),
            seed: Math.round(number(s.seed, 1)) >>> 0,
            species: species.length ? species : ['human'], shares,
            skin: colours(s.skin), hairColours: colours(s.hairColours), eyeColours: colours(s.eyeColours),
            female: clamp(Math.round(number(s.female, 50)), 0, 100),
            // Adults: a group fills a town at one press, and nobody checks each member.
            age: range(s.age, DEFAULT.age, minAge, maxAge).map(Math.round),
            extreme: !!s.extreme, anatomy: !!s.anatomy,
            ranges: Object.fromEntries(rangeItems().filter(item => s.ranges && Array.isArray(s.ranges[item.key])).map(item => [item.key, range(s.ranges[item.key], item.natural, ...(s.extreme ? item.extreme : item.natural))])),
            height: range(s.height, DEFAULT.height, ...buildLimits('height', s.extreme)), weight: range(s.weight, DEFAULT.weight, ...buildLimits('weight', s.extreme)), muscle: range(s.muscle, DEFAULT.muscle, ...buildLimits('muscle', s.extreme)),
            themes: themes.length ? themes : ['Everyday'],
            keepOutfit: !!s.keepOutfit, keepProps: !!s.keepProps,
            accessories: clamp(Math.round(number(s.accessories, 50)), 0, 100),
            palette: colours(s.palette),
            designs: !!s.designs, walk: !!s.walk, walkLayout: s.walkLayout === '8d' ? '8d' : 'mz',
            walkFrame: clamp(Math.round(number(s.walkFrame, 48)), 16, 512), walkFrames: [1, 3, 4, 6, 8, 10, 12].includes(Number(s.walkFrames)) ? Number(s.walkFrames) : 3,
            sv: !!s.sv, svFrame: clamp(Math.round(number(s.svFrame, 64)), 16, 512),
            faces: !!s.faces, faceFrame: clamp(Math.round(number(s.faceFrame, 144)), 16, 512),
            style: s.style === 'chibi' ? 'chibi' : 'realistic', look: ['pixel', 'cel'].includes(s.look) ? s.look : 'smooth', outline: s.outline !== false,
            walkAngle: clamp(Math.round(number(s.walkAngle, 30)), 0, 60), colors: clamp(Math.round(number(s.colors, 12)), 4, 24),
            shadow: !!s.shadow, shadowAngle: clamp(Math.round(number(s.shadowAngle, 30)), -179, 180), shadowDistance: clamp(Math.round(number(s.shadowDistance, 100)), 0, 200),
            faceKind: s.faceKind === 'set' ? 'set' : 'one', facePreset: String(s.facePreset || 'everyday'), faceFrames: clamp(Math.round(number(s.faceFrames, 1)), 1, 8),
            faceHold: s.faceHold === 'sweep' ? 'sweep' : 'talk', faceView: s.faceView === 'front' ? 'front' : 'three',
            outfits: ids(s.outfits, Wardrobe() && new Set(Wardrobe().PRESETS.map(p => p.id))), pieces: ids(s.pieces, Wardrobe() && Wardrobe().BY_ID),
            gear: ids(s.gear, Props() && Props().BY_ID), gearMost: clamp(Math.round(number(s.gearMost, 2)), 1, 4),
            cyberLimbs: ids(s.cyberLimbs, BodyArt() && new Set((BodyArt().LIMBS || []).map(l => l[0]))), cyberLimbShare: clamp(Math.round(number(s.cyberLimbShare, 50)), 0, 100),
            models: !!s.models,
            svStyle: (s.svStyle ?? s.style) === 'chibi' ? 'chibi' : 'realistic', svLook: ['pixel', 'cel'].includes(s.svLook ?? s.look) ? (s.svLook ?? s.look) : 'smooth', svOutline: (s.svOutline ?? s.outline) !== false,
            svColors: clamp(Math.round(number(s.svColors ?? s.colors, 12)), 4, 24), svShadow: !!(s.svShadow ?? s.shadow),
            svShadowAngle: clamp(Math.round(number(s.svShadowAngle ?? s.shadowAngle, 30)), -179, 180), svShadowDistance: clamp(Math.round(number(s.svShadowDistance ?? s.shadowDistance, 100)), 0, 200)
        };
    }

    /** Neighboring numbers scrambled apart, never 0 (as RRCharacterModel.random does). */
    const scramble = x => { x = Math.imul((x >>> 0) ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) || 1; };
    function sequence(seed) {
        let s = scramble(seed);
        return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    }

    function memberName(spec, index) {
        const digits = Math.max(2, String(spec.count).length);
        return spec.name + ' ' + String(index + 1).padStart(digits, '0');
    }

    /**
     * Member `index` of the group `spec` describes. Each member has a sequence of its own from the group's seed and
     * its number, so member 7 is the same person whether the group holds ten or a hundred, and changing one range
     * moves only what that range decides.
     */
    function member(spec, index, base) {
        const s = normalize(spec), M = Model(), own = scramble(Math.imul(s.seed + 1, 2654435761) + index * 40503);
        const rand = sequence(own), pick = list => list[Math.floor(rand() * list.length) % list.length];
        // Drawn in a fixed order, used or not, so a change to one choice leaves the others' draws where they were.
        // One draw for the species whatever the shares; with every share 1 it is the plain pick it always was.
        const share = id => s.shares[id] || 1, total = s.species.reduce((sum, id) => sum + share(id), 0);
        let species = s.species[s.species.length - 1], left = rand() * total;
        for (const id of s.species) { if (left < share(id)) { species = id; break; } left -= share(id); }
        const woman = rand() * 100 < s.female, lean = rand(), theme = pick(s.themes);
        const at = [rand(), rand(), rand(), rand()], wears = rand, colour = sequence(own + 17);
        const r = M.random(own, { species, gender: woman ? lean * 0.3 : 0.7 + lean * 0.3, theme, outfits: s.outfits.length ? s.outfits : undefined });
        if (r.plan && r.plan !== 'human') return r;
        const within = (pair, t) => pair[0] + (pair[1] - pair[0]) * t;
        r.age = Math.round(within(s.age, at[0]));
        r.height = within(s.height, at[1]); r.weight = within(s.weight, at[2]); r.muscle = within(s.muscle, at[3]);
        // Every other slider held to a range: a draw for each in the catalog's order, used or not, from a sequence of its own.
        const held = sequence(own + 83);
        for (const item of rangeItems()) {
            const at = held(), pair = s.ranges[item.key];
            if (!pair) continue;
            const value = within(pair, at);
            if (item.key.startsWith('shapes.')) r.shapes = Object.assign({}, r.shapes, { [item.key.slice(7)]: value }); else r[item.key] = value;
        }
        if (s.anatomy && r.anatomy) r.anatomy = Object.assign({}, r.anatomy, { detail: true });
        const copy = value => JSON.parse(JSON.stringify(value || []));
        // The catalog's pieces: of each kind with pieces ticked, one of them, in place of what the outfit had of that
        // kind (a dress takes the place of a top and a bottom, and they of it). From a sequence of its own.
        const W = Wardrobe(), slotOf = id => { const def = W && W.BY_ID.get(id); return def ? def.slot : ''; };
        if (!(s.keepOutfit && base) && s.pieces.length && W) {
            const piece = sequence(own + 41), out = { dress: ['top', 'bottom', 'dress'], top: ['top', 'dress'], bottom: ['bottom', 'dress'] };
            for (const [kind] of PIECE_KINDS) {
                const list = s.pieces.filter(id => slotOf(id) === kind), at = piece();
                if (!list.length) continue;
                const gone = out[kind] || [kind];
                r.outfit = (r.outfit || []).filter(item => !gone.includes(slotOf(item && item.id))).concat([{ id: list[Math.floor(at * list.length) % list.length] }]);
            }
        }
        if (s.keepOutfit && base && Array.isArray(base.outfit)) r.outfit = copy(base.outfit);
        else if (s.palette.length) for (const item of r.outfit || []) if (item && typeof item === 'object' && item.color) item.color = s.palette[Math.floor(colour() * s.palette.length) % s.palette.length];
        if (s.keepProps && base && Array.isArray(base.props)) r.props = copy(base.props);
        else if (s.gear.length) {
            // The catalog's accessories: `accessories` percent of the characters wear some, one to `gearMost` of the ticked.
            const gear = sequence(own + 53), wearing = gear() * 100 < s.accessories, count = 1 + Math.floor(gear() * s.gearMost) % s.gearMost, left = s.gear.slice();
            r.props = [];
            for (let n = 0; wearing && n < count && left.length; n++) r.props.push({ id: left.splice(Math.floor(gear() * left.length) % left.length, 1)[0] });
        } else r.props = (r.props || []).filter(() => wears() * 100 < s.accessories);
        // A cyber limb, on that share of the characters: one of the ticked limbs.
        if (s.cyberLimbs.length) {
            const limb = sequence(own + 67), has = limb() * 100 < s.cyberLimbShare, which = s.cyberLimbs[Math.floor(limb() * s.cyberLimbs.length) % s.cyberLimbs.length], A = BodyArt();
            if (has) r.bodyArt = Object.assign({}, r.bodyArt, { limbs: [A && A.normalizeLimb ? A.normalizeLimb({ limb: which, style: 'sleek' }) : { limb: which, style: 'sleek' }] });
        }
        // Colouring held to the group's own lists, from a sequence of its own: an empty list leaves the member as rolled.
        const tint = sequence(own + 29), of = (list, at) => list[Math.floor(at * list.length) % list.length];
        const tones = [tint(), tint(), tint()], S = Species();
        // A species with skin tones of its own (an orc's greens) keeps them.
        if (s.skin.length && ((r.species || 'human') === 'human' || !(S && S.skinTones && S.skinTones(r.species).length))) r.skin = of(s.skin, tones[0]);
        if (s.hairColours.length && r.hair && r.hair.style !== 'bald') {
            const c = of(s.hairColours, tones[1]);
            r.hair = Object.assign({}, r.hair, { color: c, tipColor: '', highlights: 0 });
            if (r.hair.brows && r.hair.brows.color) r.hair.brows = Object.assign({}, r.hair.brows, { color: c });
            if (r.hair.facial && r.hair.facial.color) r.hair.facial = Object.assign({}, r.hair.facial, { color: c });
        }
        if (s.eyeColours.length) r.eyes = Object.assign({}, r.eyes, { color: of(s.eyeColours, tones[2]) });
        return M.normalize(r);
    }

    function members(spec, base) {
        const s = normalize(spec);
        return Array.from({ length: s.count }, (_, i) => ({ name: memberName(s, i), recipe: member(s, i, base) }));
    }

    /** A group's portraits: MZ's face sheet holds eight, so member i is cell i % 8 of sheet floor(i / 8). */
    function faceSheets(count) {
        return Array.from({ length: Math.ceil(count / 8) }, (_, sheet) => ({ sheet, from: sheet * 8, to: Math.min(count, sheet * 8 + 8) }));
    }
    /** The group's shared face sheet; with more than one frame to a face its name says so ("[4F]"), as the game reads it. */
    const faceFile = (spec, sheet, sheets) => spec.name.replace(/\s+/g, '_') + '_Faces' + (sheets > 1 ? String(sheet + 1) : '') + (spec.faceFrames > 1 ? `[${spec.faceFrames}F]` : '') + '.png';
    /**
     * What a portrait's frames hold, as the sprite sheet takes it. On the shared sheet every face is the neutral one,
     * so its frames can only talk; a member's own face set talks or sweeps, all eight faces alike.
     */
    const faceAnim = spec => ({ faceFrames: spec.faceFrames, faceKinds: Array(8).fill(spec.faceKind === 'set' ? spec.faceHold : 'talk') });
    /** What every member's walking sheet (no prefix) or battler ('sv') is drawn with: the sprite view's settings, from the group's. */
    const lookKey = (prefix, name) => (prefix ? prefix + name[0].toUpperCase() + name.slice(1) : name);
    const spriteLook = (spec, prefix = '') => { const of = name => spec[lookKey(prefix, name)]; return { outline: of('outline'), style: of('style'), look: of('look'), colors: of('colors'), background: '', shadow: of('shadow'), shadowAngle: of('shadowAngle'), shadowDistance: of('shadowDistance') }; };

    /**
     * What a member's card shows at once, before its own picture is built: the baked picture (the ones the builder's
     * tiles use, a real 3D shot on the mannequin) of the garment that says most about it, the armour before the dress
     * before the coat before the shirt, or of its species when it wears nothing baked. The garment is in its catalog
     * colour, not the member's: it is the article, and the member's own picture takes its place.
     */
    const STAND_IN_SLOTS = ['armor', 'dress', 'over', 'cloak', 'top', 'mail', 'wrap', 'bottom', 'legarmor'];
    function standIn(recipe) {
        const B = root.Character3DBuilder, W = need('RRCharacterWardrobe', './CharacterWardrobe.js');
        if (!B || typeof B.shippedPicture !== 'function') return '';
        const r = recipe || {}, sex = r.anatomy && r.anatomy.sex, tag = (sex === 'male' || sex === 'female' ? sex === 'female' : !(r.gender >= 0.5)) ? 'f' : 'm';
        const worn = new Map();
        for (const item of Array.isArray(r.outfit) ? r.outfit : []) { const def = W && W.BY_ID.get(item && item.id); if (def && !worn.has(def.slot)) worn.set(def.slot, item.id); }
        let url = null;
        for (const slot of STAND_IN_SLOTS) if (!url && worn.has(slot)) url = B.shippedPicture('garment', tag, worn.get(slot));
        url = url || B.shippedPicture('species', tag, r.species || 'human');
        return url ? `<img class="rr-c3d-gen-standin" src="${url}" alt="">` : '';
    }

    /**
     * A cyber limb's picture for the catalog. None is baked with the editor (the builder has no tile of a limb), so
     * each is drawn once when the catalog first shows it and kept for as long as the editor runs: a plain figure in
     * underwear with that one limb, framed on the part of the body the limb is.
     */
    const limbShots = new Map();
    function limbRecipe(id, female) {
        const M = Model(), W = Wardrobe(), A = BodyArt(), wear = W && W.PRESETS.find(p => p.id === 'underwear');
        const r = M.normalize({ gender: female ? 0.15 : 0.85, outfit: wear ? W.dressFor(wear.items, female) : [], hair: { style: 'bald', brows: { style: 'none' }, lashes: false } });
        r.bodyArt = Object.assign({}, r.bodyArt, { limbs: [A && A.normalizeLimb ? A.normalizeLimb({ limb: id, style: 'sleek' }) : { limb: id, style: 'sleek' }] });
        return M.normalize(r);
    }

    // ── the panel ─────────────────────────────────────────────────────────
    const rrEscapeHtml = text => (root.rrEscapeHtml ? root.rrEscapeHtml(String(text)) : String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
    const esc = rrEscapeHtml;
    const SHOWN = 24;
    const FOLDS_KEY = 'rrCharacterGroupFolds';
    /** What a new colour in each list starts as: the next of these not already there. */
    const STARTS = {
        palette: ['#5a6b8c', '#7a3b3b', '#3f6b4a', '#c9b37a', '#2b2b33', '#e8e4da'],
        skin: ['#f1d3bd', '#e5b897', '#c69c7f', '#a8795a', '#8a5a3c', '#5e3b26'],
        hairColours: ['#2a1d16', '#5a3a22', '#8a5a2e', '#c9a35a', '#a8432a', '#c8c8c8'],
        eyeColours: ['#5b3a21', '#3f6b8c', '#5d7a4a', '#7a7f86', '#8a6a2e', '#2f4f6f']
    };

    /** The builder showing exactly `recipe`, built and painted, with nothing more on its way. */
    async function shown(builder, recipe, alive) {
        const want = JSON.stringify(builder.recipe), started = Date.now();
        let steady = 0;
        while (steady < 3) {
            if (!alive()) throw Object.assign(new Error('The group was stopped.'), { name: 'AbortError' });
            if (Date.now() - started > 180000) throw new Error('A character took too long to build.');
            // By the recipe the build was given (`_builtFor`), not the result's own: the build normalizes once more,
            // which for some people moves an ancestry weight by one bit, and the two texts then never match.
            const P = builder._painter, built = builder._result && builder._builtFor === want;
            const idle = built && !builder._pending && !builder._rebuildOwed && !(builder._liveJob && builder._liveJob.busy) && !(P && (P.busy || P.next)) && !builder._settle;
            steady = idle ? steady + 1 : 0;
            await new Promise(done => setTimeout(done, 80));
        }
    }

    /**
     * The group's panel. Over the builder's own view by default; with `options.mount`, a page of its own there
     * (`options.page`), the builder standing by out of sight to draw what is made. `options.base()` gives the
     * character a uniform is taken from, `options.open(member)` shows a member somewhere else.
     */
    function openPanel(builder, options = {}) {
        const host = options.mount || (builder.root && builder.root.querySelector('.rr-c3d-view'));
        if (!host) return null;
        const old = host.querySelector('.rr-c3d-gen');
        if (old) { if (!old.dataset.busy && !options.page) old.remove(); return options.page ? old : null; }
        // The sprite workspace gives the view back before the group's panel takes it.
        const sprites = host.querySelector('.rr-c3d-spriteview');
        if (sprites && sprites._close) sprites._close(); else host.querySelector('.rr-c3d-export')?.remove();
        const t = (text, params) => builder._t(text, params);
        const state = builder._groupSpec || (builder._groupSpec = normalize(readSpec(builder) || {}));
        const panel = document.createElement('div');
        panel.className = 'rr-c3d-export rr-c3d-gen' + (options.page ? ' is-page' : '');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', t('Character Group'));
        host.appendChild(panel);
        let stop = false, epoch = 0, tab = 'preview';
        const unfolded = new Set();
        const base = () => JSON.parse(JSON.stringify((options.base && options.base()) || builder.recipe));
        const workers = previewWorkers(builder);
        // Two numbers as a span: "40–80", and with a negative one "-100 to -50" (a dash beside a minus sign is not read).
        const between = (from, to) => (from === to ? String(from) : from < 0 || to < 0 ? from + ' ' + t('to') + ' ' + to : from + '–' + to);
        // A range as one slider with two handles: the members fall between them.
        const share = (v, lo, hi) => Math.round((v - lo) / (hi - lo) * 1000) / 10;
        const pair = (key, label, lo, hi, step, show, unit = '') => { const from = show(state[key][0]), to = show(state[key][1]); return `<div class="rr-c3d-row rr-c3d-gen-range"><span class="rr-c3d-label">${esc(t(label))}</span>
            <span class="rr-c3d-gen-dual" data-unit="${unit}" style="--lo:${share(from, lo, hi)}%;--hi:${share(to, lo, hi)}%"><input type="range" data-g="${key}" data-i="0" min="${lo}" max="${hi}" step="${step}" value="${from}" aria-label="${esc(t('{label}: from', { label: t(label) }))}"><input type="range" data-g="${key}" data-i="1" min="${lo}" max="${hi}" step="${step}" value="${to}" aria-label="${esc(t('{label}: to', { label: t(label) }))}"></span>
            <span class="rr-c3d-value">${between(from, to)}${unit}</span></div>`; };
        // A slider of the builder's as a range: "Any" until its handles are moved (each character keeps what it rolled), then held between them, with a button to let it go.
        const anyPair = item => {
            const [lo, hi] = (state.extreme ? item.extreme : item.natural).map(v => Math.round(v * 100)), set = state.ranges[item.key];
            const from = set ? Math.round(set[0] * 100) : lo, to = set ? Math.round(set[1] * 100) : hi;
            return `<div class="rr-c3d-row rr-c3d-gen-range rr-c3d-gen-any${set ? ' is-set' : ''}"><span class="rr-c3d-label" title="${esc(t(item.label))}">${esc(t(item.label))}</span>
                <span class="rr-c3d-gen-dual" data-unit="%" style="--lo:${share(from, lo, hi)}%;--hi:${share(to, lo, hi)}%"><input type="range" data-g="range" data-key="${esc(item.key)}" data-i="0" min="${lo}" max="${hi}" step="5" value="${from}" aria-label="${esc(t('{label}: from', { label: t(item.label) }))}"><input type="range" data-g="range" data-key="${esc(item.key)}" data-i="1" min="${lo}" max="${hi}" step="5" value="${to}" aria-label="${esc(t('{label}: to', { label: t(item.label) }))}"></span>
                <span class="rr-c3d-value">${set ? between(from, to) + '%' : esc(t('Any'))}</span><button class="rr-c3d-gen-anyoff" data-g="rangeoff" data-key="${esc(item.key)}" title="${esc(t('Back to Any: each character keeps what it rolled'))}"${set ? '' : ' hidden'}>✕</button></div>`;
        };
        // A section of them, folded until opened, saying how many are held.
        const anyFold = group => { const n = group.items.filter(item => state.ranges[item.key]).length, open = unfolded.has(group.section);
            return `<div class="rr-c3d-gen-fold${open ? ' is-open' : ''}"><button class="rr-c3d-gen-foldhead" data-g="unfold" data-key="${esc(group.section)}" aria-expanded="${open}"><span>${open ? '▾' : '▸'}</span><span>${esc(t(group.section))}</span><span class="rr-c3d-note">${n ? esc(t('{n} set', { n })) : esc(t('{n} sliders', { n: group.items.length }))}</span></button>${open ? group.items.map(anyPair).join('') : ''}</div>`; };
        // What to make: the tick on the left, and what it needs said under it while it is ticked.
        const toggle = (key, label, title, extra = '') => `<label class="rr-c3d-gen-toggle" title="${esc(t(title))}"><input type="checkbox" data-g="${key}"${state[key] ? ' checked' : ''}><span>${esc(t(label))}</span>${extra ? `<span class="rr-c3d-note">${esc(extra)}</span>` : ''}</label>`;
        const choice = (key, label, list, title = '') => `<label class="rr-c3d-row rr-c3d-choice"${title ? ` title="${esc(t(title))}"` : ''}><span class="rr-c3d-label">${esc(t(label))}</span><select class="rr-select" data-g="${key}">${list.map(([value, text]) => `<option value="${esc(value)}"${String(state[key]) === String(value) ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
        const size = (key, across, down) => `<label class="rr-c3d-row"><span class="rr-c3d-label">${esc(t('Frame size'))}</span><input type="number" class="rr-input" data-g="${key}" min="16" max="512" step="1" value="${state[key]}"><span class="rr-c3d-value">${across * state[key]} × ${down * state[key]}</span></label>`;
        const slide = (key, label, lo, hi, step, unit, title = '', off = false) => `<label class="rr-c3d-row"${off ? ' data-off="1"' : ''}${title ? ` title="${esc(t(title))}"` : ''}><span class="rr-c3d-label">${esc(t(label))}</span><input type="range" data-g="${key}" data-unit="${unit}" min="${lo}" max="${hi}" step="${step}" value="${state[key]}"${off ? ' disabled' : ''}><span class="rr-c3d-value">${state[key]}${unit}</span></label>`;
        const check = (key, label, title = '') => `<label class="rr-c3d-row rr-c3d-check"${title ? ` title="${esc(t(title))}"` : ''}><span class="rr-c3d-label">${esc(t(label))}</span><input type="checkbox" data-g="${key}"${state[key] ? ' checked' : ''}></label>`;
        const percent = v => Math.round(v * 100);
        // Which sections are folded, kept for the next visit.
        const folds = (() => { try { return JSON.parse(localStorage.getItem(FOLDS_KEY)) || {}; } catch (error) { return {}; } })();
        /** A section as the app's cards are: the accent-strip header that folds it, what it holds said beside the title, the controls in the body. */
        const card = (title, meta, body) => {
            const folded = !!folds[title];
            return `<div class="lit-section rr-c3d-card-sec rr-c3d-gen-sec${folded ? ' is-collapsed' : ''}">
                <div class="lit-section-header rr-c3d-sechead" data-g="fold" data-key="${esc(title)}" tabindex="0" role="button" aria-expanded="${!folded}"><span class="r3d-sec-toggle">${folded ? '▸' : '▾'}</span><span class="r3d-sec-title">${esc(t(title))}</span><span class="lit-section-meta">${esc(meta)}</span></div>
                <div class="lit-section-body rr-c3d-secbody">${body}</div></div>`;
        };
        /** A list of colours with what it colours named, and what an empty list means said in its place. */
        const colours = (key, label, any, hint, off = false) => `<div class="rr-c3d-row rr-c3d-gen-palette"${off ? ' data-off="1"' : ''} title="${esc(t(hint))}"><span class="rr-c3d-label">${esc(t(label))}</span><span class="rr-c3d-gen-swatches">${
            state[key].map((c, i) => `<button class="rr-c3d-color" data-g="swatch" data-k="${key}" data-i="${i}" style="--rr-c3d-swatch:${esc(c)}" title="${esc(t('{c}: click to change, right-click to remove', { c }))}"${off ? ' disabled' : ''}></button>`).join('')
        }${state[key].length < MOST_COLOURS ? `<button class="rr-btn-chip" data-g="addcolour" data-k="${key}" title="${esc(t('Add a colour'))}"${off ? ' disabled' : ''}>+</button>` : ''}${
            state[key].length ? `<button class="rr-btn-chip" data-g="nocolours" data-k="${key}" title="${esc(t('Remove these colours'))}"${off ? ' disabled' : ''}>${esc(t('Clear'))}</button>` : `<span class="rr-c3d-note">${esc(t(any))}</span>`}</span></div>`;
        const span = (pair, show, unit = '') => (show(pair[0]) === show(pair[1]) ? show(pair[0]) : show(pair[0]) + '–' + show(pair[1])) + unit;
        const draw = () => {
            const species = speciesChoices(), groups = [...new Set(species.map(s => s.group || ''))];
            const Sheet = root.RRCharacterSpriteSheet, sheets = faceSheets(state.count).length, label = id => { const found = species.find(x => x.id === id); return t((found && found.label) || id); };
            const kept = panel.querySelector('.rr-c3d-gen-form'), scroll = kept ? kept.scrollTop : 0;
            const several = state.species.length > 1;
            // A species' part of the group, of every ticked species' weight together.
            const mixTotal = state.species.reduce((sum, id) => sum + (state.shares[id] || 1), 0), mixShare = id => Math.round((state.shares[id] || 1) / mixTotal * 100);
            const who = state.species.slice(0, 3).map(label).join(', ') + (state.species.length > 3 ? ' +' + (state.species.length - 3) : '') + ' · ' + t('{n}% women', { n: state.female });
            const held = [state.skin.length && t('skin'), state.hairColours.length && t('hair'), state.eyeColours.length && t('eyes')].filter(Boolean);
            const made = [state.designs && t('designs'), state.models && t('3D models'), state.walk && t('walking sprites'), state.sv && t('battlers'), state.faces && t('faces')].filter(Boolean);
            const walkAcross = Sheet ? Sheet.columnsOf(state.walkLayout, Sheet.framesOf(state.walkLayout, state.walkFrames)) : 3, walkDown = Sheet ? Sheet.layout(state.walkLayout).rows : 4;
            const presets = Sheet ? Sheet.facePresets() : [], faceSet = state.faceKind === 'set';
            const looks = (Sheet ? Sheet.LOOKS : []).map(o => [o.id, t(o.label)]), styles = (Sheet ? Sheet.STYLES : []).map(o => [o.id, t(o.label)]);
            // How one kind of sprite is drawn, under its own tick: the walking sprites' (no prefix) or the battlers' ('sv').
            const lookRows = prefix => { const k = name => lookKey(prefix, name); return `
                            ${choice(k('style'), 'Body style', styles, 'Realistic keeps the character\'s own proportions. RPG chibi gives a big head and a small body.')}
                            ${choice(k('look'), 'Drawing style', looks)}
                            ${state[k('look')] === 'cel' ? slide(k('colors'), 'Number of colors', 4, 24, 1, '', 'How many colors each sprite sheet is drawn with. Fewer looks more like classic pixel art.') : ''}
                            ${check(k('outline'), 'Outline')}
                            ${check(k('shadow'), 'Shadow', 'Draws a shadow on the ground under each character.')}
                            ${state[k('shadow')] && Sheet ? `<div data-dial="${k('shadowAngle')}">${Sheet.dialRow(t, state[k('shadowAngle')])}</div>` + slide(k('shadowDistance'), 'Shadow length', 0, 200, 5, '%', 'How far the shadow reaches: 0% stays under the feet, 100% is the usual length.') : ''}`; };
            // The catalog: what the group may wear, as pictures to click. Each tab is groups of tiles; `k` is the
            // list in the description a tile's id goes in and out of.
            const B = root.Character3DBuilder, W = Wardrobe(), P = Props(), A = BodyArt(), tag = state.female >= 50 ? 'f' : 'm';
            const shot = (kind, id) => (B && typeof B.shippedPicture === 'function' && B.shippedPicture(kind, tag, id)) || '';
            const pool = outfitPool(state);
            const catalog = {
                outfits: () => [...new Set(THEMES.concat((W ? W.PRESETS : []).filter(p => p.items.length).map(p => p.group)))].filter(group => W && W.PRESETS.some(p => p.group === group && p.items.length)).map(group => ({ name: group, k: 'outfits', items: W.PRESETS.filter(p => p.group === group && p.items.length).map(p => ({ id: p.id, label: p.label, url: shot('dress', p.id), on: pool.includes(p.id) })) })),
                pieces: () => PIECE_KINDS.map(([kind, name]) => ({ name, k: 'pieces', items: (W ? W.GARMENTS : []).filter(g => g.slot === kind).map(g => ({ id: g.id, label: g.label, url: shot('garment', g.id), on: state.pieces.includes(g.id) })) })).filter(group => group.items.length),
                gear: () => [...new Set((P ? P.PROPS : []).map(x => x.group))].map(group => ({ name: group, k: 'gear', items: P.PROPS.filter(x => x.group === group).map(x => ({ id: x.id, label: x.label, url: shot('prop', x.id), on: state.gear.includes(x.id) })) }))
                    .concat(A && A.LIMBS ? [{ name: 'Cyber limbs', k: 'cyberLimbs', items: A.LIMBS.map(([id, label]) => ({ id, label, url: limbShots.get(tag + ':' + id) || '', on: state.cyberLimbs.includes(id) })) }] : [])
            };
            const TABS = [['preview', 'Preview', ''], ['outfits', 'Outfits', pool.length], ['pieces', 'Clothing pieces', state.pieces.length], ['gear', 'Accessories', state.gear.length + state.cyberLimbs.length]];
            const HINTS = {
                outfits: 'Click an outfit to add it or take it out. Each character wears one of the ticked outfits.',
                pieces: 'Optional. Tick pieces and each character wears one of the ticked pieces of that kind in place of the one in their outfit: tick three hats and everyone wears one of the three.',
                gear: 'Optional. Tick accessories and characters wear some of them in place of the ones that come with their outfit. How many is set under Clothing on the left.'
            };
            const groupsOf = tab === 'preview' ? [] : catalog[tab]();
            const catalogHtml = groupsOf.map((group, gi) => `<div class="rr-c3d-gen-cathead"><span class="rr-c3d-gen-catname">${esc(t(group.name))}</span><span class="rr-c3d-note">${esc(t('{n} of {count}', { n: group.items.filter(i => i.on).length, count: group.items.length }))}</span><span class="rr-c3d-gen-catall"><button class="rr-btn-chip" data-g="pickall" data-gi="${gi}" data-on="1">${esc(t('All'))}</button><button class="rr-btn-chip" data-g="pickall" data-gi="${gi}" data-on="0">${esc(t('None'))}</button></span></div>
                <div class="rr-c3d-gen-picks">${group.items.map(item => `<button class="rr-c3d-gen-pick${item.on ? ' is-on' : ''}" data-g="pick" data-k="${group.k}" data-id="${esc(item.id)}" aria-pressed="${item.on}" title="${esc(t(item.label))}"><span class="rr-c3d-gen-face">${item.url ? `<img src="${item.url}" alt="">` : `<span class="rr-c3d-gen-noface">${esc(t(item.label).slice(0, 1))}</span>`}</span><span class="rr-c3d-gen-name">${esc(t(item.label))}</span><span class="rr-c3d-gen-tickmark" aria-hidden="true">✓</span></button>`).join('')}</div>`).join('');
            panel._catalog = groupsOf;
            const choose = (id, label, said) => `<div class="rr-c3d-row rr-c3d-gen-cat"><span class="rr-c3d-label">${esc(t(label))}</span><span class="rr-c3d-note">${esc(said)}</span><button class="rr-btn-chip${tab === id ? ' is-active' : ''}" data-g="tab" data-tab="${id}">${esc(t('Choose…'))}</button></div>`;
            const keptCatalog = panel.querySelector('.rr-c3d-gen-catalog'), catalogScroll = keptCatalog && keptCatalog.dataset.tab === tab ? keptCatalog.scrollTop : 0;
            panel.innerHTML = `
                <div class="rr-c3d-export-head"><span>${esc(t('Character Group'))}</span>${options.page ? '' : `<button class="rr-c3d-clear" data-g="close" title="${esc(t('Close'))}">✕</button>`}</div>
                <div class="rr-c3d-gen-body">
                <div class="rr-c3d-gen-form">
                    <p class="rr-c3d-note">${esc(t('Create a whole crowd at once: townsfolk, an army, a tribe. Choose what they have in common below. Each character is random within those choices.'))}</p>
                    ${card('Group', t('{n} characters', { n: state.count }), `
                        <label class="rr-c3d-row rr-c3d-gen-wide"><span class="rr-c3d-label">${esc(t('Group name'))}</span><input type="text" class="rr-input" data-g="name" maxlength="40" value="${rrEscapeHtml(state.name)}"></label>
                        <label class="rr-c3d-row rr-c3d-gen-wide"><span class="rr-c3d-label">${esc(t('Number of characters'))}</span><input type="number" class="rr-input" data-g="count" min="1" max="${MOST}" step="1" value="${state.count}"></label>`)}
                    ${card('People', who, `
                        <div class="rr-c3d-gen-bar"><span class="rr-c3d-note">${esc(t('Which species are in the group'))}</span><span><button class="rr-btn-chip" data-g="allspecies">${esc(t('Select all'))}</button><button class="rr-btn-chip" data-g="nospecies">${esc(t('Humans only'))}</button></span></div>
                        <div class="rr-c3d-gen-ticks" data-list="species">${groups.map(g => `<div class="rr-c3d-gen-sub">${esc(t(g || 'Other'))}</div>` + species.filter(s => (s.group || '') === g).map(s => { const on = state.species.includes(s.id); return `<div class="rr-c3d-gen-tick${on ? ' is-on' : ''}"><label><input type="checkbox" data-g="species" value="${esc(s.id)}"${on ? ' checked' : ''}><span>${esc(t(s.label || s.id))}</span></label></div>`; }).join('')).join('')}</div>
                        ${several ? `<div class="rr-c3d-gen-bar"><span class="rr-c3d-note">${esc(t('How common each species is'))}</span></div>
                        <div class="rr-c3d-gen-mix">${state.species.map(id => `<label class="rr-c3d-row" title="${esc(t('Drag right for more {name} in the group, left for fewer.', { name: label(id) }))}"><span class="rr-c3d-label">${esc(label(id))}</span><input type="range" data-g="mix" data-id="${esc(id)}" min="1" max="9" step="1" value="${state.shares[id] || 1}"><span class="rr-c3d-value">${mixShare(id)}%</span></label>`).join('')}</div>` : ''}
                        <label class="rr-c3d-row"><span class="rr-c3d-label">${esc(t('Women'))}</span><input type="range" data-g="female" data-unit="%" min="0" max="100" step="5" value="${state.female}"><span class="rr-c3d-value">${state.female}%</span></label>`)}
                    ${card('Body', t('ages {a}', { a: span(state.age, v => v) }), `
                        <p class="rr-c3d-note">${esc(t('Drag the two handles to set the lowest and the highest. Each character lands somewhere between them.'))}</p>
                        ${pair('age', 'Age', 18, 90, 1, v => v, ' ' + t('years'))}
                        ${['height', 'weight', 'muscle'].map(key => { const [lo, hi] = buildLimits(key, state.extreme); return pair(key, key[0].toUpperCase() + key.slice(1), Math.round(lo * 100), Math.round(hi * 100), 5, percent, '%'); }).join('')}
                        <p class="rr-c3d-note">${esc(t('Every other body slider of the builder. A slider left on Any is random for each character. Move its handles to hold everyone between them.'))}</p>
                        ${rangeCatalog().body.map(anyFold).join('')}
                        ${check('extreme', 'Extreme proportions', 'Lets every slider go far past natural limits, as the same switch does in the builder.')}
                        ${check('anatomy', 'Anatomical detail', 'Builds every character with full anatomical detail, as the same switch does in the builder. It shows only where clothing does not cover it.')}`)}
                    ${card('Face and head', (n => (n ? t('{n} set', { n }) : t('random')))(rangeCatalog().face.flatMap(g => g.items).filter(item => state.ranges[item.key]).length), `
                        <p class="rr-c3d-note">${esc(t('The builder\'s face sliders. Left on Any, every face is random. Move a slider\'s handles to give the group a shared feature, like large ears or a narrow jaw.'))}</p>
                        ${rangeCatalog().face.map(anyFold).join('')}`)}
                    ${card('Colouring', held.length ? t('held: {list}', { list: held.join(', ') }) : t('natural'), `
                        <p class="rr-c3d-note">${esc(t('Leave a row empty for natural colours. Add colours to a row and every character uses one of them.'))}</p>
                        ${colours('skin', 'Skin', 'Natural tones', 'The skin tones the group may have. A species with its own skin tones keeps them.')}
                        ${colours('hairColours', 'Hair', 'Natural colours', 'The hair colours the group may have. Eyebrows and beards match.')}
                        ${colours('eyeColours', 'Eyes', 'Natural colours', 'The eye colours the group may have.')}`)}
                    ${card('Clothing', state.keepOutfit ? t('one outfit') : t(pool.length === 1 ? '{n} outfit' : '{n} outfits', { n: pool.length }), `
                        <p class="rr-c3d-note">${esc(t('Choose what the group can wear from the picture catalog. It opens on the right.'))}</p>
                        <div${state.keepOutfit ? ' data-off="1"' : ''}>
                        ${choose('outfits', 'Outfits', t(pool.length === 1 ? '{n} chosen' : '{n} chosen', { n: pool.length }))}
                        ${choose('pieces', 'Clothing pieces', state.pieces.length ? t('{n} chosen', { n: state.pieces.length }) : t('As each outfit comes'))}
                        </div>
                        <div${state.keepProps ? ' data-off="1"' : ''}>
                        ${choose('gear', 'Accessories', state.gear.length + state.cyberLimbs.length ? t('{n} chosen', { n: state.gear.length + state.cyberLimbs.length }) : t('Each outfit\'s own'))}
                        ${slide('accessories', 'Who wears them', 0, 100, 5, '%', 'How many of the characters wear accessories: 0% is nobody, 100% is everyone.', state.keepProps)}
                        ${state.gear.length ? choice('gearMost', 'How many each', [[1, t('1')], [2, t('1 or 2')], [3, t('1 to 3')], [4, t('1 to 4')]], 'How many of the chosen accessories one character wears.') : ''}
                        ${state.cyberLimbs.length ? slide('cyberLimbShare', 'Cyber limbs', 0, 100, 5, '%', 'How many of the characters have one of the chosen cyber limbs.') : ''}
                        </div>
                        ${colours('palette', 'Clothing colours', 'Each style\'s usual colours', 'Add colours here and everyone\'s clothes use them, like team colours. Leave it empty for each style\'s usual colours.', state.keepOutfit)}
                        ${check('keepOutfit', 'Same outfit for everyone', 'Everyone wears the outfit of the character now open in the builder, like a uniform.')}
                        ${check('keepProps', 'Same accessories for everyone', 'Everyone gets the accessories of the character now open in the builder.')}`)}
                    ${card('What to create', made.join(', ') || t('nothing ticked'), `
                        <div class="rr-c3d-gen-kind">${esc(t('To keep editing'))}</div>
                        ${toggle('designs', 'Save each character as a design', 'Each character is saved in a design group with this name, so you can open and change it in the builder later.')}
                        <div class="rr-c3d-gen-kind">${esc(t('3D'))}</div>
                        ${toggle('models', '3D models', 'A 3D model of each character with its animations, saved to 3D Models › Characters, ready for 3D maps and battles. This is the slowest thing to create.')}
                        <div class="rr-c3d-gen-kind">${esc(t('2D sprites'))}</div>
                        ${toggle('walk', 'Walking sprites', 'A walking sprite sheet for each character, saved in img/characters.')}
                        ${state.walk ? `<div class="rr-c3d-gen-opts">
                            ${choice('walkLayout', 'Directions', [['mz', t('4 directions')], ['8d', t('8 directions [8D]')]])}
                            ${size('walkFrame', walkAcross, walkDown)}
                            ${choice('walkFrames', 'Walk frames', (Sheet ? Sheet.FRAME_CHOICES : [3]).map(n => [n, n === 3 ? t('3 frames (RPG Maker standard)') : n === 1 ? t('1 frame (standing only)') : t('{n} frames', { n })]), 'How many pictures make up one walking step. More frames walk more smoothly.')}
                            ${slide('walkAngle', 'Camera angle', 0, 60, 1, '°', 'How far from above the characters are seen. 0° is straight from the side.')}${lookRows('')}
                        </div>` : ''}
                        ${toggle('sv', 'Side-view battlers', 'A side-view battler sheet for each character, saved in img/sv_actors.')}
                        ${state.sv ? `<div class="rr-c3d-gen-opts">${size('svFrame', 9, 6)}${lookRows('sv')}</div>` : ''}
                        ${toggle('faces', 'Faces', 'Face pictures for messages and menus, saved in img/faces.', t(faceSet ? (state.count === 1 ? '{n} file' : '{n} files') : (sheets === 1 ? '{n} file' : '{n} files'), { n: faceSet ? state.count : sheets }))}
                        ${state.faces ? `<div class="rr-c3d-gen-opts">
                            ${choice('faceKind', 'Face files', [['one', t('Shared: 8 characters per file')], ['set', t('One file per character, 8 expressions')]], 'Shared puts one face of each character on a file, eight characters to a file. One file per character gives each character eight expressions of their own.')}
                            ${size('faceFrame', 4 * state.faceFrames, 2)}
                            ${faceSet && presets.length ? choice('facePreset', 'Expressions', presets.map(p => [p.id, t(p.label)]), 'Which eight expressions each character gets.') : ''}
                            ${choice('faceFrames', 'Animation', [1, 2, 3, 4, 5, 6, 7, 8].map(n => [n, n === 1 ? t('None') : t('{n} frames', { n })]), 'Animated faces move in the message window. More frames move more smoothly and make a bigger file.')}
                            ${faceSet && state.faceFrames > 1 ? choice('faceHold', 'Animation type', [['talk', t('Talking (the mouth moves)')], ['sweep', t('Changing expression')]], 'Talking moves the mouth while the text appears. Changing expression goes from a neutral face to the expression: in the Show Text command, set the face to Play once.') : ''}
                            ${choice('faceView', 'Facing', [['three', t('Slightly turned')], ['front', t('Straight ahead')]])}
                        </div>` : ''}`)}
                </div>
                <div class="rr-c3d-gen-side">
                    <div class="rr-c3d-gen-tabs" role="tablist">${TABS.map(([id, label, n]) => `<button class="rr-c3d-gen-tab${tab === id ? ' is-active' : ''}" role="tab" aria-selected="${tab === id}" data-g="tab" data-tab="${id}">${esc(t(label))}${n === '' ? '' : `<span class="rr-c3d-gen-count">${n}</span>`}</button>`).join('')}</div>
                    ${tab === 'preview' ? `<div class="rr-c3d-gen-sidehead"><span>${esc(t(state.count > SHOWN ? 'The first {n} of {count} characters' : 'The characters this group will create', { n: SHOWN, count: state.count }))}</span><button class="rr-btn-chip" data-g="reroll" title="${esc(t('Different random characters with the same choices'))}">${esc(t('Shuffle'))}</button></div>
                    <div class="rr-c3d-gen-grid"></div>` : `<p class="rr-c3d-note rr-c3d-gen-hint">${esc(t(HINTS[tab]))}</p>
                    <div class="rr-c3d-gen-catalog" data-tab="${tab}">${catalogHtml}</div>`}
                </div>
                </div>
                <div class="rr-c3d-export-progress" hidden><div></div></div>
                <div class="rr-c3d-export-status" aria-live="polite"></div>
                <div class="rr-c3d-export-foot">${options.page ? '' : `<button class="rr-btn-chip" data-g="close">${esc(t('Close'))}</button>`}<button class="rr-btn-chip" data-g="stop" hidden>${esc(t('Stop'))}</button><button class="rr-btn-chip rr-c3d-export-go" data-g="make">${esc(t(state.count === 1 ? 'Create {n} character' : 'Create {n} characters', { n: state.count }))}</button></div>`;
            for (const fill of panel.querySelectorAll('input[type="range"]')) fill.style.setProperty('--rr-fill', ((Number(fill.value) - Number(fill.min)) / (Number(fill.max) - Number(fill.min)) * 100) + '%');
            const form = panel.querySelector('.rr-c3d-gen-form');
            if (form) form.scrollTop = scroll;
            const shownCatalog = panel.querySelector('.rr-c3d-gen-catalog');
            if (shownCatalog) shownCatalog.scrollTop = catalogScroll;
            if (tab === 'gear') limbPictures(tag);
            preview();
        };
        const fold = head => {
            const key = head.dataset.key, sec = head.parentElement, folded = !folds[key];
            if (folded) folds[key] = true; else delete folds[key];
            sec.classList.toggle('is-collapsed', folded);
            head.setAttribute('aria-expanded', String(!folded));
            head.querySelector('.r3d-sec-toggle').textContent = folded ? '▸' : '▾';
            try { localStorage.setItem(FOLDS_KEY, JSON.stringify(folds)); } catch (error) { /* a fold not kept */ }
        };
        /** The cyber limbs' pictures still to draw, on the preview's workers, each put in its tile as it is done. One run at a time. */
        let limbRun = null;
        const limbPictures = tag => {
            const A = BodyArt(), todo = ((A && A.LIMBS) || []).map(l => l[0]).filter(id => !limbShots.has(tag + ':' + id));
            if (limbRun || !todo.length || typeof builder._renderThumb !== 'function' || panel.dataset.busy) return;
            const alive = () => panel.isConnected && !panel.dataset.busy && tab === 'gear';
            const lane = async (worker, n) => {
                while (alive() && todo.length) {
                    const id = todo.shift(), recipe = limbRecipe(id, tag === 'f');
                    try {
                        await builder._configurePreview(worker, recipe, '_groupMarks' + n);
                        const result = await worker.build({ key: 'limb|' + tag + '|' + id, recipe, cacheKey: 'group', options: { quality: 'preview', skinSize: 128, atlasSize: 256, hairBudget: 0.3, static: true, thumb: true } });
                        if (!panel.isConnected) return;
                        // Framed on the limb: the build says where each limb is (RRCharacterModel.previewBounds, 'limb:armL').
                        const url = await builder._renderThumb({ result, frame: result.focus && result.focus['limb:' + id] ? 'limb:' + id : 'body', size: 192 }, () => panel.isConnected);
                        if (!url) continue;
                        limbShots.set(tag + ':' + id, url);
                        const face = panel.querySelector(`.rr-c3d-gen-pick[data-k="cyberLimbs"][data-id="${id}"] .rr-c3d-gen-face`);
                        if (face) face.innerHTML = `<img src="${url}" alt="">`;
                    } catch (error) {
                        if (error && error.name === 'AbortError') return;
                        console.warn('[RRCharacterGroups] limb picture', error);
                    }
                }
            };
            limbRun = Promise.all(workers.list().map((worker, n) => lane(worker, n))).finally(() => { limbRun = null; });
        };
        /** What a member has that its small picture may hide under a sleeve or lose to its size: said under its name. */
        const extras = recipe => {
            const A = BodyArt(), limbs = ((recipe.bodyArt && recipe.bodyArt.limbs) || []).map(l => { const found = A && (A.LIMBS || []).find(x => x[0] === l.limb); return t('Cyber {limb}', { limb: t(found ? found[1] : l.limb).toLowerCase() }); });
            return limbs.length ? `<span class="rr-c3d-gen-extra" title="${esc(limbs.join(', '))}">${esc(limbs.join(', '))}</span>` : '';
        };
        /** The first members as the builder's own thumbnails, one after another; a change of description starts over. */
        const preview = async () => {
            const mine = ++epoch, grid = panel.querySelector('.rr-c3d-gen-grid');
            if (!grid) return;
            if (tab !== 'preview') return;
            const list = members(Object.assign({}, state, { count: Math.min(SHOWN, state.count) }), base());
            // Every member at once as a baked picture of what it wears (nothing is built for it); its own picture follows.
            grid.innerHTML = list.map((m, i) => `<button class="rr-c3d-gen-card" data-g="open" data-i="${i}" title="${esc(t('Open {name} in the builder', { name: m.name }))}"><span class="rr-c3d-gen-face">${standIn(m.recipe)}</span><span class="rr-c3d-gen-name">${esc(m.name)}</span>${extras(m.recipe)}</button>`).join('');
            if (tab !== 'preview' || typeof builder._renderThumb !== 'function' || panel.dataset.busy) return;
            // Each worker takes the next member not yet begun: two or three are built at once where the machine has
            // the cores, and each is a picture's build (`thumb`: no sewn details, no rigs), not a whole character's.
            let next = 0;
            const current = () => mine === epoch && panel.isConnected && !panel.dataset.busy;
            const lane = async (worker, lane) => {
                while (current() && next < list.length) {
                    const i = next++;
                    try {
                        await builder._configurePreview(worker, list[i].recipe, '_groupMarks' + lane);
                        const result = await worker.build({ key: 'group|' + state.seed + '|' + i + '|' + mine, recipe: list[i].recipe, cacheKey: 'group', options: { quality: 'preview', skinSize: 128, atlasSize: 256, hairBudget: 0.3, static: true, thumb: true } });
                        if (!current()) return;
                        // Twice the builder's tile: a cyber arm or a hat is a few pixels at 96.
                        const url = await builder._renderThumb({ result, frame: 'body', size: 192 }, current);
                        const face = grid.children[i] && grid.children[i].querySelector('.rr-c3d-gen-face');
                        if (url && face && mine === epoch) face.innerHTML = `<img src="${url}" alt="">`;
                    } catch (error) {
                        if (error && error.name === 'AbortError') return;
                        console.warn('[RRCharacterGroups] preview', error);
                    }
                }
            };
            // The members' own pictures start once the description has rested a moment (a range being dragged).
            await new Promise(done => setTimeout(done, 150));
            if (!current()) return;
            workers.list().forEach((worker, index) => lane(worker, index));
        };
        const soon = () => { clearTimeout(panel._soon); panel._soon = setTimeout(() => { if (panel.isConnected && !panel.dataset.busy) { Object.assign(state, normalize(state)); writeSpec(builder, state); draw(); } }, 350); };
        const status = (text, kind = '') => { const el = panel.querySelector('.rr-c3d-export-status'); if (el) { el.textContent = text; el.dataset.kind = kind; } };
        panel.addEventListener('input', e => {
            const g = e.target.dataset.g;
            if (!g || panel.dataset.busy) return;
            const el = e.target, dual = el.closest('.rr-c3d-gen-dual');
            if (g === 'mix') {
                // How common a species is: its weight (1 to 9), shown as its part of the group, the others' parts moving with it.
                state.shares = Object.assign({}, state.shares, { [el.dataset.id]: Number(el.value) });
                const rows = [...panel.querySelectorAll('input[data-g="mix"]')], total = rows.reduce((sum, row) => sum + Number(row.value), 0);
                for (const row of rows) { row.style.setProperty('--rr-fill', ((Number(row.value) - 1) / 8 * 100) + '%'); row.parentElement.querySelector('.rr-c3d-value').textContent = Math.round(Number(row.value) / total * 100) + '%'; }
                soon();
            } else if (dual) {
                // Two handles on one track: the one being moved stops at the other.
                const i = Number(el.dataset.i), other = dual.querySelector(`input[data-i="${1 - i}"]`), lo = Number(el.min), hi = Number(el.max);
                let v = Number(el.value);
                if (i === 0 && v > Number(other.value)) v = Number(other.value);
                if (i === 1 && v < Number(other.value)) v = Number(other.value);
                el.value = String(v);
                const from = Number(i === 0 ? v : other.value), to = Number(i === 1 ? v : other.value), unit = dual.dataset.unit || '';
                dual.style.setProperty('--lo', share(from, lo, hi) + '%'); dual.style.setProperty('--hi', share(to, lo, hi) + '%');
                dual.parentElement.querySelector('.rr-c3d-value').textContent = between(from, to) + unit;
                if (g === 'range') { state.ranges = Object.assign({}, state.ranges, { [el.dataset.key]: [from / 100, to / 100] }); const row = dual.parentElement; row.classList.add('is-set'); row.querySelector('.rr-c3d-gen-anyoff').hidden = false; }
                else state[g] = g === 'age' ? [from, to] : [from / 100, to / 100];
                soon();
            } else if (el.type === 'range') { state[g] = Number(el.value); el.style.setProperty('--rr-fill', ((Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min)) * 100) + '%'); const v = el.parentElement.querySelector('.rr-c3d-value'); if (v) v.textContent = el.value + (el.dataset.unit || ''); soon(); }
        });
        panel.addEventListener('change', e => {
            const g = e.target.dataset.g, el = e.target;
            if (!g || panel.dataset.busy) return;
            if (g === 'species' || g === 'themes') {
                state[g] = [...panel.querySelectorAll(`input[data-g="${g}"]:checked`)].map(x => x.value);
            } else if (['age', 'height', 'weight', 'muscle', 'range'].includes(g)) {
                return;   // kept as the handles move ('input')
            } else if (g === 'mix') {
                return;   // kept as the slider moves ('input')
            } else if (el.type === 'checkbox') state[g] = el.checked;
            else if (el.type === 'number') state[g] = Number(el.value);
            else if (el.type !== 'range') state[g] = el.value;
            soon();
        });
        panel.addEventListener('click', e => {
            const b = e.target.closest('[data-g]');
            if (!b) return;
            const g = b.dataset.g;
            if (g === 'stop') { stop = true; status(t('Stopping after this character…')); return; }
            if (g === 'fold') { fold(b); return; }
            if (panel.dataset.busy) return;
            if (g === 'tab') { tab = b.dataset.tab; draw(); }
            else if (g === 'unfold') { if (unfolded.has(b.dataset.key)) unfolded.delete(b.dataset.key); else unfolded.add(b.dataset.key); draw(); }
            else if (g === 'rangeoff') { const next = Object.assign({}, state.ranges); delete next[b.dataset.key]; state.ranges = next; writeSpec(builder, state); draw(); }
            else if (g === 'pick' || g === 'pickall') {
                // A tile in or out of its list, or a whole group of them. The outfits always keep one.
                const group = g === 'pickall' ? (panel._catalog || [])[Number(b.dataset.gi)] : null, k = group ? group.k : b.dataset.k;
                const now = new Set(k === 'outfits' ? outfitPool(state) : state[k]);
                if (group) for (const item of group.items) { if (b.dataset.on === '1') now.add(item.id); else now.delete(item.id); }
                else if (now.has(b.dataset.id)) now.delete(b.dataset.id); else now.add(b.dataset.id);
                if (k === 'outfits' && !now.size) { status(t('Keep at least one outfit ticked.'), 'error'); return; }
                state[k] = [...now];
                if (k === 'outfits') { const W = Wardrobe(), styles = [...new Set(W.PRESETS.filter(p => now.has(p.id)).map(p => p.group))].filter(id => THEMES.includes(id)); if (styles.length) state.themes = styles; }
                status('');
                Object.assign(state, normalize(state)); writeSpec(builder, state); draw();
            }
            else if (g === 'close') { epoch++; workers.dispose(); panel.remove(); }
            else if (g === 'reroll') { state.seed = (Math.random() * 4294967296) >>> 0; writeSpec(builder, state); draw(); }
            else if (g === 'allspecies') { state.species = speciesChoices().map(x => x.id); writeSpec(builder, state); draw(); }
            else if (g === 'nospecies') { state.species = ['human']; writeSpec(builder, state); draw(); }
            else if (g === 'nocolours') { state[b.dataset.k] = []; writeSpec(builder, state); draw(); }
            else if (g === 'addcolour' || g === 'swatch') {
                const k = b.dataset.k, list = state[k];
                if (g === 'addcolour') { state[k] = list.concat((STARTS[k] || STARTS.palette).find(c => !list.includes(c)) || '#808080'); writeSpec(builder, state); draw(); return; }
                const i = Number(b.dataset.i);
                if (root.RRColorPopover) root.RRColorPopover.open(b, { value: list[i], onInput: hex => { b.style.setProperty('--rr-c3d-swatch', hex); }, onChange: hex => { state[k][i] = hex; writeSpec(builder, state); draw(); } });
            } else if (g === 'open') {
                // One member into the builder, to look at closely or to change and save by hand.
                const m = members(Object.assign({}, state, { count: Math.min(SHOWN, state.count) }), base())[Number(b.dataset.i)];
                if (m && options.open) options.open(m);
                else if (m) { epoch++; workers.dispose(); panel.remove(); builder.name = m.name; const input = builder.root.querySelector('.rr-c3d-name-input'); if (input) input.value = m.name; builder._selectPreset(m.recipe); }
            } else if (g === 'make') make();
        });

        // The shadow's dial, as in the sprite view. The angle is kept without drawing the panel again under the hand.
        if (root.RRCharacterSpriteSheet) root.RRCharacterSpriteSheet.watchDial(panel, dial => state[dial.closest('[data-dial]').dataset.dial], (angle, dial) => { state[dial.closest('[data-dial]').dataset.dial] = angle; clearTimeout(panel._dialKept); panel._dialKept = setTimeout(() => writeSpec(builder, state), 300); });
        // One colour out of its list.
        panel.addEventListener('contextmenu', e => {
            const b = e.target.closest('[data-g="swatch"]');
            if (!b || panel.dataset.busy) return;
            e.preventDefault();
            state[b.dataset.k] = state[b.dataset.k].filter((c, i) => i !== Number(b.dataset.i));
            writeSpec(builder, state); draw();
        });
        panel.addEventListener('keydown', e => {
            const head = e.target.closest && e.target.closest('.rr-c3d-sechead');
            if (head && e.target === head && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fold(head); }
        });

        /** Every member built on the builder's own view in turn, and what was asked for made of each. */
        const make = async () => {
            const project = builder._project && builder._project(), Sheet = root.RRCharacterSpriteSheet;
            if (!project || !Sheet || !builder._view) return;
            Object.assign(state, normalize(state));
            if (!state.designs && !state.models && !state.walk && !state.sv && !state.faces) { status(t('Tick at least one thing to create.'), 'error'); return; }
            const fs = require('fs'), path = require('path');
            const list = members(state, base()), sheets = faceSheets(list.length);
            const walkFile = m => path.join(project.path, 'img', 'characters', Sheet.fileName(state.walkLayout, Sheet.safeName(m.name), state.walkFrames));
            const svFile = m => path.join(project.path, 'img', 'sv_actors', Sheet.fileName('sv', Sheet.safeName(m.name)));
            const faceAt = sheet => path.join(project.path, 'img', 'faces', faceFile(state, sheet, sheets.length));
            // A face set of a member's own: named for the member, with its frames said as the sprite view says them.
            const ownFaces = state.faceKind === 'set', anim = faceAnim(state), frames = state.faceFrames;
            const setFile = m => path.join(project.path, 'img', 'faces', Sheet.fileName('face', Sheet.safeName(m.name), undefined, anim));
            const presets = Sheet.facePresets(), expressions = (presets.find(p => p.id === state.facePreset) || presets[0]).expressions.slice();
            const designDir = builder._designsDir(state.name);
            // A 3D model of each, where Export Model To Project puts one.
            const modelName = m => builder._folderName(m.name), modelFile = m => path.join(builder._charactersDir(), modelName(m), 'source', modelName(m) + '.glb');
            const existing = [];
            for (const m of list) { if (state.models && fs.existsSync(modelFile(m))) existing.push(modelFile(m)); if (state.walk && fs.existsSync(walkFile(m))) existing.push(walkFile(m)); if (state.sv && fs.existsSync(svFile(m))) existing.push(svFile(m)); if (state.designs && fs.existsSync(path.join(designDir, m.name + '.json'))) existing.push(m.name); if (state.faces && ownFaces && fs.existsSync(setFile(m))) existing.push(setFile(m)); }
            if (state.faces && !ownFaces) for (const s of sheets) if (fs.existsSync(faceAt(s.sheet))) existing.push(faceAt(s.sheet));
            if (existing.length && !await root.RRDialog.confirm(t('{n} of this group\'s files are there already. Replace them?', { n: existing.length }), { title: t('Character Group'), ok: t('Replace'), danger: true })) return;
            const rootElement = builder.root, view = builder._view;
            const alive = () => !stop && builder.root === rootElement && builder._view === view && panel.isConnected;
            const before = { recipe: base(), name: builder.name, group: builder.designGroup, opened: builder._openedDesign };
            // The members are drawn where the preview is: back to it from the catalog, before the bar is found.
            if (tab !== 'preview') { tab = 'preview'; draw(); }
            const bar = panel.querySelector('.rr-c3d-export-progress'), go = panel.querySelector('[data-g="make"]'), halt = panel.querySelector('[data-g="stop"]');
            epoch++; stop = false;
            panel.dataset.busy = '1';
            bar.hidden = false; go.disabled = true; halt.hidden = false;
            const atomic = root.RRWriteFileAtomicSync || ((io, target, data) => io.writeFileSync(target, data));
            const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); atomic(fs, file, data); };
            const common = spriteLook(state);
            const started = performance.now(), made = [];
            const faceSize = state.faceFrame;
            let faces = null, done = 0;
            try {
                for (let i = 0; i < list.length; i++) {
                    const m = list[i];
                    status(t('{name}: building… ({i} of {n})', { name: m.name, i: i + 1, n: list.length }));
                    builder.name = m.name;
                    builder._selectPreset(m.recipe);
                    await shown(builder, m.recipe, alive);
                    const entry = { name: m.name, recipe: builder.recipe };
                    if (state.designs) {
                        write(path.join(designDir, m.name + '.json'), JSON.stringify({ builder: 'character3d', version: 2, recipe: builder.recipe }, null, 2) + '\n');
                        const thumb = builder._thumbnail();
                        if (thumb) write(path.join(designDir, m.name + '.png'), thumb);
                    }
                    if (state.models && alive()) {
                        status(t('{name}: 3D model… ({i} of {n})', { name: m.name, i: i + 1, n: list.length }));
                        if (await builder._writeModel(modelName(m), alive)) entry.model = '3d/Characters/' + modelName(m);
                    }
                    if (state.walk && alive()) {
                        status(t('{name}: walking sheet…', { name: m.name }));
                        const sheet = await Sheet.render(builder, Object.assign({ layout: state.walkLayout, frame: state.walkFrame, frames: state.walkFrames, elevation: state.walkAngle }, common));
                        write(walkFile(m), await Sheet.toPng(sheet));
                        entry.walk = 'img/characters/' + path.basename(walkFile(m));
                    }
                    if (state.sv && alive()) {
                        status(t('{name}: side-view battler…', { name: m.name }));
                        const sheet = await Sheet.render(builder, Object.assign({ layout: 'sv', frame: state.svFrame, elevation: Sheet.layout('sv').elevation }, spriteLook(state, 'sv')));
                        write(svFile(m), await Sheet.toPng(sheet));
                        entry.sv = 'img/sv_actors/' + path.basename(svFile(m));
                    }
                    if (state.faces && ownFaces && alive()) {
                        status(t('{name}: face set…', { name: m.name }));
                        const sheet = await Sheet.render(builder, { layout: 'face', frame: faceSize, view: state.faceView, expressions, face: Sheet.faceAnimOf(anim), background: '' });
                        write(setFile(m), await Sheet.toPng(sheet));
                        entry.face = { file: 'img/faces/' + path.basename(setFile(m)), index: 0 };
                    } else if (state.faces && alive()) {
                        status(t('{name}: face…', { name: m.name }));
                        // One neutral portrait (all its frames), into this member's cell of the group's sheet.
                        const one = await Sheet.render(builder, { layout: 'face', frame: faceSize, view: state.faceView, expressions: ['neutral'], only: 1, face: Sheet.faceAnimOf(anim), background: '' });
                        const sheet = Math.floor(i / 8), cell = i % 8, wide = faceSize * frames;
                        if (!faces || faces.sheet !== sheet) { if (faces) write(faceAt(faces.sheet), await Sheet.toPng(faces)); faces = { sheet, width: wide * 4, height: faceSize * 2, data: new Uint8ClampedArray(wide * 4 * faceSize * 2 * 4) }; }
                        const col = cell % 4, row = Math.floor(cell / 4);
                        for (let y = 0; y < faceSize; y++) faces.data.set(one.data.subarray(y * one.width * 4, (y * one.width + wide) * 4), ((row * faceSize + y) * faces.width + col * wide) * 4);
                        entry.face = { file: 'img/faces/' + faceFile(state, sheet, sheets.length), index: cell };
                    }
                    made.push(entry);
                    done = i + 1;
                    bar.firstElementChild.style.width = Math.round(done / list.length * 100) + '%';
                    if (!alive()) break;
                }
                if (faces) { const last = faces; faces = null; write(faceAt(last.sheet), await Sheet.toPng(last)); }
            } catch (error) {
                if (!(error && error.name === 'AbortError')) { console.error('[RRCharacterGroups] make', error); status(t('The group stopped at {name}: {why}', { name: list[Math.min(done, list.length - 1)].name, why: String(error && error.message || error) }), 'error'); }
            } finally {
                // A group stopped or failed part way: the face sheet it was filling is written too, since the record
                // below names it for the members already drawn into it.
                try { if (faces && made.some(entry => entry.face)) write(faceAt(faces.sheet), await Sheet.toPng(faces)); } catch (error) { console.warn('[RRCharacterGroups] face sheet', error); }
                // Who is in the group and where each one's pictures are: for the author, and for placing them later.
                try { if (made.length) write(path.join(groupsDir(builder), state.name + '.json'), JSON.stringify({ builder: 'character3d-group', version: 1, spec: state, members: made.map(({ recipe, ...rest }) => rest) }, null, 2) + '\n'); } catch (error) { console.warn('[RRCharacterGroups] record', error); }
                delete panel.dataset.busy;
                if (builder.root === rootElement && builder._view === view) {
                    builder.name = before.name; builder.designGroup = before.group; builder._openedDesign = before.opened;
                    const input = builder.root.querySelector('.rr-c3d-name-input'); if (input) input.value = before.name || '';
                    builder._selectPreset(before.recipe);
                    builder._renderDesignGroups?.();
                }
                if (panel.isConnected) {
                    bar.hidden = true; go.disabled = false; halt.hidden = true;
                    const seconds = Math.round((performance.now() - started) / 1000), el = panel.querySelector('.rr-c3d-export-status');
                    if (el && el.dataset.kind !== 'error') status(done === list.length ? t('{n} characters created in {s} s.', { n: done, s: seconds }) : t('Stopped: {n} of {count} created.', { n: done, count: list.length }), done ? 'ok' : '');
                    stop = false;
                    preview();
                }
            }
        };
        panel._dispose = () => { epoch++; workers.dispose(); };
        draw();
        return panel;
    }

    /**
     * The workers that build the preview's members off the page: one, two where the machine has eight cores, three
     * with sixteen. Started when first needed and kept for as long as the panel stands (starting and ending workers
     * over and over is what once ran the editor out of memory), then ended with it.
     */
    function previewWorkers(builder) {
        let made = null;
        const count = () => { const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 4; return cores >= 16 ? 3 : cores >= 8 ? 2 : 1; };
        return {
            list() {
                if (made) return made;
                made = [];
                try {
                    const { PreviewWorker } = require(require('path').join(Body().dataFolder(), '..', 'CharacterPreviewWorker.cjs'));
                    for (let i = 0; i < count(); i++) made.push(new PreviewWorker());
                } catch (error) {
                    // No workers of our own here (a browser build): the builder's one.
                    try { made = [builder._previewPool()]; made.borrowed = true; } catch (inner) { made = []; }
                }
                return made;
            },
            dispose() {
                if (made && !made.borrowed) for (const worker of made) { try { worker.dispose(); } catch (error) { /* gone already */ } }
                for (let i = 0; i < 4; i++) delete builder['_groupMarks' + i];
                made = null;
            }
        };
    }

    // The description last used in this project, kept beside the designs.
    function groupsDir(builder) {
        const path = require('path');
        return path.join(path.dirname(builder._designsDir('')), 'groups');
    }
    // In a folder of its own (`groups/page/last.json`): beside the groups' records it was `groups/last.json`, which a
    // group named "last" wrote its record over. That older file is still read, unless it is such a record.
    function readSpec(builder) {
        const fs = require('fs'), path = require('path');
        try { return JSON.parse(fs.readFileSync(path.join(groupsDir(builder), 'page', 'last.json'), 'utf8')); } catch (error) { /* the older place next */ }
        try { const old = JSON.parse(fs.readFileSync(path.join(groupsDir(builder), 'last.json'), 'utf8')); return old && !old.builder ? old : null; } catch (error) { return null; }
    }
    function writeSpec(builder, spec) {
        try { const fs = require('fs'), dir = require('path').join(groupsDir(builder), 'page'); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(require('path').join(dir, 'last.json'), JSON.stringify(spec, null, 2) + '\n'); } catch (error) { /* a project that cannot be written keeps the description for the session */ }
    }

    /**
     * The Forge's own entry for groups: the 3D Character Builder, opened straight onto the group panel. The group is
     * made on the builder's view (its workers, its studio, its sheets), so this is that tool with the panel up.
     */
    class Tool {
        renderInto(containerEl, projectController) {
            this.detach();
            // A page of its own: the description and the members fill it. A builder stands by out of sight (its view,
            // its workers, its studio) to draw what is made; it is never the page.
            containerEl.innerHTML = `<div class="rr-c3d-genpage"><div class="rr-c3d-genpage-main"><p class="rr-c3d-note rr-c3d-genpage-wait">…</p></div><div class="rr-c3d-genpage-stage" aria-hidden="true"></div></div>`;
            const main = this.main = containerEl.querySelector('.rr-c3d-genpage-main'), stage = containerEl.querySelector('.rr-c3d-genpage-stage');
            const builder = this.builder = new root.Character3DBuilder();
            // The description stays with this entry while the Forge is open (and in the project between sessions).
            // It is one project's: another project opened since reads its own.
            const project = projectController && (projectController.getCurrentProject?.() || projectController.currentProject);
            const projectPath = (project && project.path) || '';
            if (this.specProject !== projectPath) this.spec = null;
            this.specProject = projectPath;
            if (this.spec) builder._groupSpec = this.spec;
            builder.renderInto(stage, projectController);
            // Out of sight, the builder's own view is drawn only while a group is being made: each frame of it is a
            // whole character drawn for nobody, and every member's picture waits its turn behind one.
            const frame = builder._render;
            builder._render = function () { if (main.querySelector('.rr-c3d-gen[data-busy]')) return frame.apply(this, arguments); };
            let tries = 0;
            this._wait = setInterval(() => {
                if (this.builder !== builder || ++tries > 600) { clearInterval(this._wait); return; }
                if (!builder._view || !builder._result || !builder.root) return;
                clearInterval(this._wait);
                main.innerHTML = '';
                this.panel = openPanel(builder, { mount: main, page: true, base: () => Tool.builderRecipe(), open: member => this.openInBuilder(member) });
                this.spec = builder._groupSpec;
            }, 100);
        }
        /** The character open in the Forge's 3D Character Builder, when it has been opened: whose outfit a uniform is. */
        static builderRecipe() {
            const forge = root.reactor && root.reactor.forgeManager, real = forge && forge.character3dBuilder;
            return real && real.recipe ? real.recipe : null;
        }
        /** A member into the 3D Character Builder itself: the Forge goes to that tool, and this page keeps its description. */
        openInBuilder(member) {
            const forge = root.reactor && root.reactor.forgeManager;
            if (!forge || !root.Character3DBuilder) return;
            const real = forge.character3dBuilder || (forge.character3dBuilder = new root.Character3DBuilder());
            if (real.root && real._view && typeof real._selectPreset === 'function') { real.name = member.name; real._openedDesign = null; real._selectPreset(member.recipe); }
            else Object.assign(real, { recipe: Model().normalize(member.recipe), name: member.name, cache: {}, pose: 'idle', extreme: false, _openedDesign: null });
            forge.openTool('character-3d-builder');
        }
        detach() {
            clearInterval(this._wait);
            const builder = this.builder;
            if (builder && builder._groupSpec) this.spec = builder._groupSpec;
            if (this.panel && this.panel._dispose) this.panel._dispose();
            this.panel = null;
            this.builder = null;
            if (builder && typeof builder.detach === 'function') builder.detach();
        }
        holdsWork() { return !!(this.main && this.main.querySelector('.rr-c3d-gen[data-busy]')); }
    }

    const api = { DEFAULT, THEMES, MOST, normalize, member, members, memberName, buildLimits, rangeCatalog, faceSheets, faceFile, faceAnim, spriteLook, limbRecipe, outfitPool, PIECE_KINDS, speciesChoices, standIn, openPanel, Tool };
    root.RRCharacterGroups = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
