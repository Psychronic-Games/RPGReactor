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
        style: 'realistic', look: 'smooth', outline: true
    };

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

    function normalize(spec) {
        const s = Object.assign({}, DEFAULT, spec || {});
        const known = new Set(speciesChoices().map(x => x.id)), minAge = Math.max(18, (Body() && Body().MIN_AGE) || 18), maxAge = (Body() && Body().MAX_AGE) || 90;
        const species = (Array.isArray(s.species) ? s.species : []).filter(id => known.has(id));
        const themes = (Array.isArray(s.themes) ? s.themes : []).filter(t => THEMES.includes(t));
        const colours = list => (Array.isArray(list) ? list : []).filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, MOST_COLOURS);
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
            height: range(s.height, DEFAULT.height, 0, 1), weight: range(s.weight, DEFAULT.weight, 0, 1), muscle: range(s.muscle, DEFAULT.muscle, 0, 1),
            themes: themes.length ? themes : ['Everyday'],
            keepOutfit: !!s.keepOutfit, keepProps: !!s.keepProps,
            accessories: clamp(Math.round(number(s.accessories, 50)), 0, 100),
            palette: colours(s.palette),
            designs: !!s.designs, walk: !!s.walk, walkLayout: s.walkLayout === '8d' ? '8d' : 'mz',
            walkFrame: clamp(Math.round(number(s.walkFrame, 48)), 16, 512), walkFrames: [1, 3, 4, 6, 8, 10, 12].includes(Number(s.walkFrames)) ? Number(s.walkFrames) : 3,
            sv: !!s.sv, svFrame: clamp(Math.round(number(s.svFrame, 64)), 16, 512),
            faces: !!s.faces, faceFrame: clamp(Math.round(number(s.faceFrame, 144)), 16, 512),
            style: s.style === 'chibi' ? 'chibi' : 'realistic', look: ['pixel', 'cel'].includes(s.look) ? s.look : 'smooth', outline: s.outline !== false
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
        const r = M.random(own, { species, gender: woman ? lean * 0.3 : 0.7 + lean * 0.3, theme });
        if (r.plan && r.plan !== 'human') return r;
        const within = (pair, t) => pair[0] + (pair[1] - pair[0]) * t;
        r.age = Math.round(within(s.age, at[0]));
        r.height = within(s.height, at[1]); r.weight = within(s.weight, at[2]); r.muscle = within(s.muscle, at[3]);
        const copy = value => JSON.parse(JSON.stringify(value || []));
        if (s.keepOutfit && base && Array.isArray(base.outfit)) r.outfit = copy(base.outfit);
        else if (s.palette.length) for (const item of r.outfit || []) if (item && typeof item === 'object' && item.color) item.color = s.palette[Math.floor(colour() * s.palette.length) % s.palette.length];
        if (s.keepProps && base && Array.isArray(base.props)) r.props = copy(base.props);
        else r.props = (r.props || []).filter(() => wears() * 100 < s.accessories);
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
    const faceFile = (spec, sheet, sheets) => spec.name.replace(/\s+/g, '_') + '_Faces' + (sheets > 1 ? String(sheet + 1) : '') + '.png';

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
        let stop = false, epoch = 0;
        const base = () => JSON.parse(JSON.stringify((options.base && options.base()) || builder.recipe));
        const workers = previewWorkers(builder);
        const pair = (key, label, lo, hi, step, show) => `<div class="rr-c3d-row rr-c3d-gen-range"><span class="rr-c3d-label">${esc(t(label))}</span>
            <input type="number" class="rr-input" data-g="${key}" data-i="0" min="${lo}" max="${hi}" step="${step}" value="${show(state[key][0])}"><span class="rr-c3d-gen-to">${esc(t('to'))}</span>
            <input type="number" class="rr-input" data-g="${key}" data-i="1" min="${lo}" max="${hi}" step="${step}" value="${show(state[key][1])}"></div>`;
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
            const sheets = faceSheets(state.count).length, label = id => { const found = species.find(x => x.id === id); return t((found && found.label) || id); };
            const kept = panel.querySelector('.rr-c3d-gen-form'), scroll = kept ? kept.scrollTop : 0;
            const several = state.species.length > 1;
            const who = state.species.slice(0, 3).map(label).join(', ') + (state.species.length > 3 ? ' +' + (state.species.length - 3) : '') + ' · ' + t('{n}% women', { n: state.female });
            const held = [state.skin.length && t('skin'), state.hairColours.length && t('hair'), state.eyeColours.length && t('eyes')].filter(Boolean);
            const made = [state.designs && t('designs'), state.walk && t('walking'), state.sv && t('battlers'), state.faces && t('portraits')].filter(Boolean);
            panel.innerHTML = `
                <div class="rr-c3d-export-head"><span>${esc(t('Character Group'))}</span>${options.page ? '' : `<button class="rr-c3d-clear" data-g="close" title="${esc(t('Close'))}">✕</button>`}</div>
                <div class="rr-c3d-gen-body">
                <div class="rr-c3d-gen-form">
                    <p class="rr-c3d-note">${esc(t('Many characters to one description: a town, an army, a people. Each is the standard random character held to these limits.'))}</p>
                    ${card('Group', t('{n} named {name}', { n: state.count, name: state.name }), `
                        <label class="rr-c3d-row"><span class="rr-c3d-label">${esc(t('Group name'))}</span><input type="text" class="rr-input" data-g="name" maxlength="40" value="${rrEscapeHtml(state.name)}"></label>
                        <label class="rr-c3d-row"><span class="rr-c3d-label">${esc(t('How many'))}</span><input type="number" class="rr-input" data-g="count" min="1" max="${MOST}" step="1" value="${state.count}"></label>`)}
                    ${card('People', who, `
                        <div class="rr-c3d-gen-bar"><span class="rr-c3d-note">${esc(t(several ? 'Species, and how many of each to one of the others' : 'Species'))}</span><span><button class="rr-btn-chip" data-g="allspecies">${esc(t('All'))}</button><button class="rr-btn-chip" data-g="nospecies">${esc(t('Only human'))}</button></span></div>
                        <div class="rr-c3d-gen-ticks" data-list="species">${groups.map(g => `<div class="rr-c3d-gen-sub">${esc(t(g || 'Other'))}</div>` + species.filter(s => (s.group || '') === g).map(s => { const on = state.species.includes(s.id); return `<label><input type="checkbox" data-g="species" value="${esc(s.id)}"${on ? ' checked' : ''}><span>${esc(t(s.label || s.id))}</span>${on && several ? `<select class="rr-select rr-c3d-gen-share" data-g="share" data-id="${esc(s.id)}" title="${esc(t('Share: how many of this species to each one of a species set to ×1'))}">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<option value="${n}"${(state.shares[s.id] || 1) === n ? ' selected' : ''}>×${n}</option>`).join('')}</select>` : ''}</label>`; }).join('')).join('')}</div>
                        <label class="rr-c3d-row"><span class="rr-c3d-label">${esc(t('Women'))}</span><input type="range" data-g="female" min="0" max="100" step="5" value="${state.female}"><span class="rr-c3d-value">${state.female}%</span></label>`)}
                    ${card('Body', t('age {a}', { a: span(state.age, v => v) }), `
                        <p class="rr-c3d-note">${esc(t('Each member falls somewhere between the two numbers. The same number twice holds everyone to it.'))}</p>
                        ${pair('age', 'Age', 18, 90, 1, v => v)}
                        ${pair('height', 'Height (%)', 0, 100, 5, percent)}
                        ${pair('weight', 'Weight (%)', 0, 100, 5, percent)}
                        ${pair('muscle', 'Muscle (%)', 0, 100, 5, percent)}`)}
                    ${card('Colouring', held.length ? t('held: {list}', { list: held.join(', ') }) : t('natural'), `
                        <p class="rr-c3d-note">${esc(t('An empty row keeps the natural spread. With colours in a row, every member takes one of them.'))}</p>
                        ${colours('skin', 'Skin', 'Natural tones', 'Skin tones the members are drawn from. A species with tones of its own keeps them.')}
                        ${colours('hairColours', 'Hair', 'Natural colours', 'Hair colours the members are drawn from; brows and beards follow.')}
                        ${colours('eyeColours', 'Eyes', 'Natural colours', 'Eye colours the members are drawn from.')}`)}
                    ${card('Clothing', state.keepOutfit ? t('one outfit') : state.themes.map(id => t(id)).join(', '), `
                        ${check('keepOutfit', 'Everyone wears this outfit', 'The outfit of the character open in the builder, on every member: a uniform.')}
                        ${check('keepProps', 'Everyone has these accessories', 'The accessories of the character open in the builder, on every member.')}
                        <div class="rr-c3d-gen-bar"><span class="rr-c3d-note">${esc(t('Settings the outfits come from'))}</span></div>
                        <div class="rr-c3d-gen-ticks"${state.keepOutfit ? ' data-off="1"' : ''}>${THEMES.map(id => `<label><input type="checkbox" data-g="themes" value="${esc(id)}"${state.themes.includes(id) ? ' checked' : ''}${state.keepOutfit ? ' disabled' : ''}><span>${esc(t(id))}</span></label>`).join('')}</div>
                        ${colours('palette', 'Garments', 'Each setting\'s own colours', 'With colours here, every garment\'s main colour is one of them: a livery. With none, each setting\'s own colours.', state.keepOutfit)}
                        <label class="rr-c3d-row"${state.keepProps ? ' data-off="1"' : ''} title="${esc(t('How often a member keeps each accessory its outfit came with: 0% none, 100% all of them.'))}"><span class="rr-c3d-label">${esc(t('Accessories'))}</span><input type="range" data-g="accessories" min="0" max="100" step="5" value="${state.accessories}"${state.keepProps ? ' disabled' : ''}><span class="rr-c3d-value">${state.accessories}%</span></label>`)}
                    ${card('Make', made.join(', ') || t('nothing ticked'), `
                        ${check('designs', 'Saved designs', 'Each member kept as a design in a group of this name, to open and change in the builder.')}
                        <div class="rr-c3d-row rr-c3d-gen-out"><label class="rr-c3d-gen-outcheck"><input type="checkbox" data-g="walk"${state.walk ? ' checked' : ''}>${esc(t('Walking sheets'))}</label><select class="rr-select" data-g="walkLayout"><option value="mz"${state.walkLayout === 'mz' ? ' selected' : ''}>${esc(t('4 directions'))}</option><option value="8d"${state.walkLayout === '8d' ? ' selected' : ''}>${esc(t('8 directions [8D]'))}</option></select><input type="number" class="rr-input" data-g="walkFrame" min="16" max="512" value="${state.walkFrame}" title="${esc(t('Frame size'))}"></div>
                        <div class="rr-c3d-row rr-c3d-gen-out"><label class="rr-c3d-gen-outcheck"><input type="checkbox" data-g="sv"${state.sv ? ' checked' : ''}>${esc(t('Side-view battlers'))}</label><span></span><input type="number" class="rr-input" data-g="svFrame" min="16" max="512" value="${state.svFrame}" title="${esc(t('Frame size'))}"></div>
                        <div class="rr-c3d-row rr-c3d-gen-out"><label class="rr-c3d-gen-outcheck" title="${esc(t('One portrait of each member, eight to a face sheet.'))}"><input type="checkbox" data-g="faces"${state.faces ? ' checked' : ''}>${esc(t('Portraits'))}</label><span class="rr-c3d-note">${esc(t('{n} sheet(s)', { n: sheets }))}</span><input type="number" class="rr-input" data-g="faceFrame" min="16" max="512" value="${state.faceFrame}" title="${esc(t('Frame size'))}"></div>
                        <label class="rr-c3d-row rr-c3d-choice"><span class="rr-c3d-label">${esc(t('Style'))}</span><select class="rr-select" data-g="style"><option value="realistic"${state.style === 'realistic' ? ' selected' : ''}>${esc(t('Realistic'))}</option><option value="chibi"${state.style === 'chibi' ? ' selected' : ''}>${esc(t('RPG chibi'))}</option></select></label>
                        <label class="rr-c3d-row rr-c3d-choice"><span class="rr-c3d-label">${esc(t('Look'))}</span><select class="rr-select" data-g="look"><option value="smooth"${state.look === 'smooth' ? ' selected' : ''}>${esc(t('Smooth'))}</option><option value="pixel"${state.look === 'pixel' ? ' selected' : ''}>${esc(t('Pixel art'))}</option><option value="cel"${state.look === 'cel' ? ' selected' : ''}>${esc(t('Pixel art, drawn'))}</option></select></label>
                        ${check('outline', 'Outline')}`)}
                </div>
                <div class="rr-c3d-gen-side">
                    <div class="rr-c3d-gen-sidehead"><span>${esc(t('The first {n} of {count}', { n: Math.min(SHOWN, state.count), count: state.count }))}</span><button class="rr-btn-chip" data-g="reroll" title="${esc(t('Another group to the same description'))}">${esc(t('Roll again'))}</button></div>
                    <div class="rr-c3d-gen-grid"></div>
                </div>
                </div>
                <div class="rr-c3d-export-progress" hidden><div></div></div>
                <div class="rr-c3d-export-status" aria-live="polite"></div>
                <div class="rr-c3d-export-foot">${options.page ? '' : `<button class="rr-btn-chip" data-g="close">${esc(t('Close'))}</button>`}<button class="rr-btn-chip" data-g="stop" hidden>${esc(t('Stop'))}</button><button class="rr-btn-chip rr-c3d-export-go" data-g="make">${esc(t('Make {n} characters', { n: state.count }))}</button></div>`;
            for (const fill of panel.querySelectorAll('input[type="range"]')) fill.style.setProperty('--rr-fill', fill.value + '%');
            const form = panel.querySelector('.rr-c3d-gen-form');
            if (form) form.scrollTop = scroll;
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
        /** The first members as the builder's own thumbnails, one after another; a change of description starts over. */
        const preview = async () => {
            const mine = ++epoch, grid = panel.querySelector('.rr-c3d-gen-grid');
            if (!grid) return;
            const list = members(Object.assign({}, state, { count: Math.min(SHOWN, state.count) }), base());
            // Every member at once as a baked picture of what it wears (nothing is built for it); its own picture follows.
            grid.innerHTML = list.map((m, i) => `<button class="rr-c3d-gen-card" data-g="open" data-i="${i}" title="${esc(t('Open {name} in the builder', { name: m.name }))}"><span class="rr-c3d-gen-face">${standIn(m.recipe)}</span><span class="rr-c3d-gen-name">${esc(m.name)}</span></button>`).join('');
            if (typeof builder._renderThumb !== 'function' || panel.dataset.busy) return;
            // Each worker takes the next member not yet begun: two or three are built at once where the machine has
            // the cores, and each is a picture's build (`thumb`: no sewn details, no rigs), not a whole character's.
            let next = 0;
            const current = () => mine === epoch && panel.isConnected && !panel.dataset.busy;
            const lane = async (worker, lane) => {
                while (current() && next < list.length) {
                    const i = next++;
                    try {
                        await builder._configurePreview(worker, list[i].recipe, '_groupMarks' + lane);
                        const result = await worker.build({ key: 'group|' + state.seed + '|' + i + '|' + mine, recipe: list[i].recipe, cacheKey: 'group', options: { quality: 'preview', skinSize: 64, atlasSize: 128, hairBudget: 0.3, static: true, thumb: true } });
                        if (!current()) return;
                        const url = await builder._renderThumb({ result, frame: 'body' }, current);
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
            if (e.target.type === 'range') { state[g] = Number(e.target.value); e.target.style.setProperty('--rr-fill', e.target.value + '%'); const v = e.target.parentElement.querySelector('.rr-c3d-value'); if (v) v.textContent = e.target.value + '%'; soon(); }
        });
        panel.addEventListener('change', e => {
            const g = e.target.dataset.g, el = e.target;
            if (!g || panel.dataset.busy) return;
            if (g === 'species' || g === 'themes') {
                state[g] = [...panel.querySelectorAll(`input[data-g="${g}"]:checked`)].map(x => x.value);
            } else if (['age', 'height', 'weight', 'muscle'].includes(g)) {
                const next = state[g].slice(), v = Number(el.value);
                if (Number.isFinite(v)) next[Number(el.dataset.i)] = g === 'age' ? v : v / 100;
                state[g] = next;
            } else if (g === 'share') {
                state.shares = Object.assign({}, state.shares, { [el.dataset.id]: Number(el.value) });
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
            if (g === 'close') { epoch++; workers.dispose(); panel.remove(); }
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
            if (!state.designs && !state.walk && !state.sv && !state.faces) { status(t('Tick something to make.'), 'error'); return; }
            const fs = require('fs'), path = require('path');
            const list = members(state, base()), sheets = faceSheets(list.length);
            const walkFile = m => path.join(project.path, 'img', 'characters', Sheet.fileName(state.walkLayout, Sheet.safeName(m.name), state.walkFrames));
            const svFile = m => path.join(project.path, 'img', 'sv_actors', Sheet.fileName('sv', Sheet.safeName(m.name)));
            const faceAt = sheet => path.join(project.path, 'img', 'faces', faceFile(state, sheet, sheets.length));
            const designDir = builder._designsDir(state.name);
            const existing = [];
            for (const m of list) { if (state.walk && fs.existsSync(walkFile(m))) existing.push(walkFile(m)); if (state.sv && fs.existsSync(svFile(m))) existing.push(svFile(m)); if (state.designs && fs.existsSync(path.join(designDir, m.name + '.json'))) existing.push(m.name); }
            if (state.faces) for (const s of sheets) if (fs.existsSync(faceAt(s.sheet))) existing.push(faceAt(s.sheet));
            if (existing.length && !await root.RRDialog.confirm(t('{n} of this group\'s files are there already. Replace them?', { n: existing.length }), { title: t('Character Group'), ok: t('Replace'), danger: true })) return;
            const rootElement = builder.root, view = builder._view;
            const alive = () => !stop && builder.root === rootElement && builder._view === view && panel.isConnected;
            const before = { recipe: base(), name: builder.name, group: builder.designGroup, opened: builder._openedDesign };
            const bar = panel.querySelector('.rr-c3d-export-progress'), go = panel.querySelector('[data-g="make"]'), halt = panel.querySelector('[data-g="stop"]');
            epoch++; stop = false;
            panel.dataset.busy = '1';
            bar.hidden = false; go.disabled = true; halt.hidden = false;
            const atomic = root.RRWriteFileAtomicSync || ((io, target, data) => io.writeFileSync(target, data));
            const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); atomic(fs, file, data); };
            const common = { outline: state.outline, style: state.style, look: state.look, background: '' };
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
                    if (state.walk) {
                        status(t('{name}: walking sheet…', { name: m.name }));
                        const sheet = await Sheet.render(builder, Object.assign({ layout: state.walkLayout, frame: state.walkFrame, frames: state.walkFrames, elevation: Sheet.layout(state.walkLayout).elevation }, common));
                        write(walkFile(m), await Sheet.toPng(sheet));
                        entry.walk = 'img/characters/' + path.basename(walkFile(m));
                    }
                    if (state.sv && alive()) {
                        status(t('{name}: side-view battler…', { name: m.name }));
                        const sheet = await Sheet.render(builder, Object.assign({ layout: 'sv', frame: state.svFrame, elevation: Sheet.layout('sv').elevation }, common));
                        write(svFile(m), await Sheet.toPng(sheet));
                        entry.sv = 'img/sv_actors/' + path.basename(svFile(m));
                    }
                    if (state.faces && alive()) {
                        status(t('{name}: portrait…', { name: m.name }));
                        // One neutral portrait, into this member's cell of the group's sheet.
                        const one = await Sheet.render(builder, { layout: 'face', frame: faceSize, view: 'three', expressions: ['neutral'], only: 1, background: '' });
                        const sheet = Math.floor(i / 8), cell = i % 8;
                        if (!faces || faces.sheet !== sheet) { if (faces) write(faceAt(faces.sheet), await Sheet.toPng(faces)); faces = { sheet, width: faceSize * 4, height: faceSize * 2, data: new Uint8ClampedArray(faceSize * 4 * faceSize * 2 * 4) }; }
                        const col = cell % 4, row = Math.floor(cell / 4);
                        for (let y = 0; y < faceSize; y++) faces.data.set(one.data.subarray(y * one.width * 4, (y * one.width + faceSize) * 4), ((row * faceSize + y) * faces.width + col * faceSize) * 4);
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
                    if (el && el.dataset.kind !== 'error') status(done === list.length ? t('{n} characters made in {s} s.', { n: done, s: seconds }) : t('Stopped: {n} of {count} made.', { n: done, count: list.length }), done ? 'ok' : '');
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

    const api = { DEFAULT, THEMES, MOST, normalize, member, members, memberName, faceSheets, faceFile, speciesChoices, standIn, openPanel, Tool };
    root.RRCharacterGroups = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
