/**
 * RRNatureProp - the Nature family of the 3D Prop Builder: hero trees,
 * bushes and plants, rocks and alien flora, each grown from a short recipe:
 *
 *   { kind: 'nature', form, preset, seed, size (m), spread, character (0..1),
 *     season, stone, cover, palette, glow (0..1), sway }
 *
 * `form` is the type (a broadleaf tree, a boulder, a lantern tree...),
 * `preset` its kind (oak, ancient oak...), `seed` the take on it (Shuffle).
 * `spread` and `character` are the two shape sliders each type names for
 * itself (Spread and Age, Width and Weathering...). Look: a season for
 * plants, a stone and its cover for rocks, a palette and glow for alien
 * flora. With `sway`, a saved model carries a gentle wind loop (the clip
 * Sway on a wind bone; the trunk's foot stays put).
 *
 * The models are in meters and stand on their origin: a tile is about
 * 0.6 m, so the readout gives the size to place one at.
 */
(function(root) {
    'use strict';

    const need = (name, file) => { if (root[name]) return root[name]; try { return typeof require === 'function' ? require(file) : null; } catch (e) { return null; } };
    const Kit = need('RRNatureKit', './NatureKit.js');
    const Tex = need('RRNatureTexture', './NatureTexture.js');
    const Trees = need('RRTreeConstruction', './TreeConstruction.js');
    const Plants = need('RRPlantConstruction', './PlantConstruction.js');
    const Rocks = need('RRRockConstruction', './RockConstruction.js');
    const Alien = need('RRAlienFlora', './AlienFlora.js');
    const { clamp } = Kit.vec;

    const TILE = 0.6;
    const SEASONS = [['spring', 'Spring'], ['summer', 'Summer'], ['autumn', 'Autumn'], ['bare', 'Bare'], ['snow', 'Snow']];
    const STONES = [['granite', 'Granite'], ['sandstone', 'Sandstone'], ['basalt', 'Basalt'], ['slate', 'Slate'], ['limestone', 'Limestone'], ['redrock', 'Red rock'], ['volcanic', 'Volcanic'], ['alien', 'Alien stone']];
    const COVERS = [['none', 'None'], ['moss', 'Moss'], ['snow', 'Snow'], ['sand', 'Sand'], ['lichen', 'Lichen']];
    const PALETTES = [['teal', 'Teal'], ['magenta', 'Magenta'], ['violet', 'Violet'], ['amber', 'Amber'], ['toxic', 'Toxic green'], ['crimson', 'Crimson'], ['ice', 'Ice blue']];

    /**
     * The types: [id, label, category, icon, family, sliders [spread, character] labels,
     * size range (m), presets [[id, label, defaults]], keywords].
     * Defaults: { size, spread, character, season, stone, cover, palette, glow }.
     */
    const FORMS = [
        ['broadleaf', 'Broadleaf tree', 'trees', 'tree', 'tree', ['Spread', 'Age'], [2, 30], [
            ['oak', 'Oak', { size: 11, character: 0.35 }], ['ancient', 'Ancient oak', { size: 14, character: 0.95, spread: 0.4 }], ['maple', 'Maple', { size: 10, season: 'autumn' }], ['sacred', 'Sacred tree', { size: 9, character: 0.6, spread: 0.6 }]], 'oak maple deciduous'],
        ['conifer', 'Conifer', 'trees', 'conifer', 'tree', ['Spread', 'Density'], [2, 35], [
            ['spruce', 'Spruce', { size: 14 }], ['fir', 'Fir', { size: 12, season: 'snow' }], ['pine', 'Pine', { size: 16, character: 0.4 }], ['cedar', 'Cedar', { size: 15, spread: 0.6, character: 0.5 }]], 'pine spruce fir cedar evergreen christmas'],
        ['palm', 'Palm tree', 'trees', 'palm', 'tree', ['Lean', 'Fronds'], [2, 25], [
            ['coconut', 'Coconut palm', { size: 9, spread: 0.45 }], ['date', 'Date palm', { size: 10, spread: 0.1, character: 0.6 }], ['fanpalm', 'Fan palm', { size: 13, spread: 0.05, character: 0.5 }]], 'tropical beach coconut desert oasis'],
        ['birch', 'Birch', 'trees', 'tree', 'tree', ['Spread', 'Droop'], [2, 25], [
            ['birch', 'Silver birch', { size: 12, spread: 0.3 }], ['clump', 'Birch clump', { size: 11, spread: 0.85, character: 0.85 }], ['aspen', 'Aspen', { size: 13, season: 'autumn' }]], 'aspen white bark slender'],
        ['willow', 'Willow', 'trees', 'willow', 'tree', ['Spread', 'Droop'], [2, 22], [
            ['willow', 'Weeping willow', { size: 9, character: 0.7 }]], 'weeping river pond'],
        ['dead', 'Dead tree', 'trees', 'deadtree', 'tree', ['Spread', 'Gnarl'], [1.5, 25], [
            ['dead', 'Dead tree', { size: 8, character: 0.5 }], ['spooky', 'Haunted tree', { size: 9, character: 0.7 }], ['snag', 'Broken snag', { size: 7, character: 0.3 }]], 'bare twisted gnarled spooky haunted swamp'],
        ['baobab', 'Bottle tree', 'trees', 'baobab', 'tree', ['Girth', 'Crown'], [2, 25], [
            ['baobab', 'Baobab', { size: 11, spread: 0.5 }], ['bottle', 'Bottle tree', { size: 8 }], ['dragon', 'Dragon tree', { size: 7, spread: 0.5 }]], 'baobab savanna desert dragon blood'],
        ['blossom', 'Blossom tree', 'trees', 'blossom', 'tree', ['Spread', 'Age'], [2, 20], [
            ['cherry', 'Cherry blossom', { size: 7, season: 'spring' }], ['jacaranda', 'Jacaranda', { size: 9, season: 'spring' }], ['magnolia', 'Magnolia', { size: 7, season: 'spring' }]], 'sakura cherry spring flowers pink']
    ];
    const BY_ID = new Map(FORMS.map(f => [f[0], f]));
    /** The extra forms another file adds (plants, rocks, alien flora) register through `addForms`. */
    function addForms(list) { for (const f of list) { if (!BY_ID.has(f[0])) FORMS.push(f); BY_ID.set(f[0], f); } }
    for (const family of [Plants, Rocks, Alien]) if (family && family.FORMS) addForms(family.FORMS);

    const FAMILY_DEFAULTS = {
        tree: { spread: 0.5, character: 0.5, season: 'summer', stone: 'granite', cover: 'none', palette: 'teal', glow: 0.6, sway: true },
        plant: { spread: 0.5, character: 0.5, season: 'summer', stone: 'granite', cover: 'none', palette: 'teal', glow: 0.6, sway: true },
        rock: { spread: 0.5, character: 0.5, season: 'summer', stone: 'granite', cover: 'moss', palette: 'teal', glow: 0.6, sway: false },
        alien: { spread: 0.5, character: 0.5, season: 'summer', stone: 'alien', cover: 'none', palette: 'teal', glow: 0.7, sway: true }
    };
    const ids = list => list.map(x => x[0]);

    function presetOf(form, id) { const f = BY_ID.get(form); return (f[7].find(p => p[0] === id) || f[7][0]); }

    function normalize(r = {}) {
        const form = BY_ID.has(r.form) ? r.form : 'broadleaf', f = BY_ID.get(form), p = presetOf(form, r.preset), d = Object.assign({}, FAMILY_DEFAULTS[f[4]], p[2]);
        const num = (v, lo, hi, def) => (Number.isFinite(+v) && v !== null && v !== '' ? clamp(+v, lo, hi) : def);
        const pick = (v, list, def) => (ids(list).includes(v) ? v : def);
        return {
            kind: 'nature', form, preset: p[0],
            seed: Number.isFinite(+r.seed) && +r.seed > 0 ? Math.floor(+r.seed) % 1000000007 : 1,
            size: Math.round(num(r.size, f[6][0], f[6][1], d.size) * 100) / 100,
            spread: num(r.spread, 0, 1, d.spread), character: num(r.character, 0, 1, d.character),
            season: pick(r.season, SEASONS, d.season), stone: pick(r.stone, STONES, d.stone), cover: pick(r.cover, COVERS, d.cover),
            palette: pick(r.palette, PALETTES, d.palette), glow: num(r.glow, 0, 1, d.glow),
            sway: typeof r.sway === 'boolean' ? r.sway : d.sway
        };
    }

    /** A preset's recipe; `keep` carries the seed and sway over (a preset picked keeps its take). */
    function fromPreset(form, preset, keep) {
        const k = keep || {};
        return normalize({ form, preset, seed: k.seed || 1, sway: k.sway });
    }

    // ── pictures, kept between builds ──────────────────────────────────────
    function picture(cache, key, make) {
        const store = cache.naturePictures || (cache.naturePictures = new Map());
        if (store.has(key)) { const v = store.get(key); store.delete(key); store.set(key, v); return v; }
        const v = make();
        store.set(key, v);
        while (store.size > 40) store.delete(store.keys().next().value);
        return v;
    }

    // ── trees ──────────────────────────────────────────────────────────────
    function buildTree(r, cache, env) {
        const t = Trees.build(r, env), sp = t.species, out = { parts: [], textures: {} };
        const [style, cols] = sp.bark, barkSize = env.quick ? 256 : 512;
        const bark = picture(cache, ['bark', style, cols.join(), barkSize].join('|'), () => Tex.bark(style, cols, barkSize, 7));
        out.textures[bark.albedo.name] = bark.albedo; out.textures[bark.normal.name] = bark.normal;
        out.parts.push([t.geos.bark, { name: 'Bark', texture: bark.albedo.name, normalTexture: bark.normal.name, normalScale: 1, roughness: 0.93 }]);
        if (Kit.count(t.geos.leaves)) {
            const leafSize = env.quick ? 512 : 1024, snow = t.season === 'snow' ? 0.9 : 0;
            const key = ['leaves', r.preset, t.season, leafSize].join('|');
            const pic = picture(cache, key, () => Tex.leaves(r.preset + '-' + t.season, t.cells, leafSize, 5, { snow }));
            out.textures[pic.name] = pic;
            out.parts.push([t.geos.leaves, { name: 'Leaves', texture: pic.name, cutout: true, alphaCutoff: 0.42, roughness: 0.95 }]);
        }
        if (Kit.count(t.geos.fruit)) out.parts.push([t.geos.fruit, { name: 'Fruit', roughness: 0.5 }]);
        if (Kit.count(t.geos.rope)) out.parts.push([t.geos.rope, { name: 'Rope', roughness: 0.95 }]);
        if (Kit.count(t.geos.paper)) out.parts.push([t.geos.paper, { name: 'Paper', roughness: 0.8, doubleSided: true }]);
        coverParts(out, t.covers, cache, env);
        out.swayDegrees = 1.3;
        return out;
    }

    /** Snow, moss or sand shells as parts, with their pictures. */
    function coverParts(out, covers, cache, env) {
        for (const [kind, g] of Object.entries(covers || {})) {
            if (!g || !Kit.count(g)) continue;
            const pic = picture(cache, 'cover|' + kind, () => Tex.coverPicture(kind, 256, 3));
            out.textures[pic.albedo.name] = pic.albedo; out.textures[pic.normal.name] = pic.normal;
            out.parts.push([g, { name: kind[0].toUpperCase() + kind.slice(1), texture: pic.albedo.name, normalTexture: pic.normal.name, normalScale: 0.8, cutout: true, alphaCutoff: 0.5, roughness: kind === 'snow' ? 0.55 : 0.95 }]);
        }
    }

    // ── the wind ───────────────────────────────────────────────────────────
    const LOOP = 4;
    /** A gentle sway: the wind bone leans a little one way and the other, with a slower second swing across. */
    function swayClip(degrees, seed) {
        const R = Kit.roll(seed * 13 + 5), keys = 33, times = new Float32Array(keys), values = new Float32Array(keys * 4);
        const a = degrees * Math.PI / 180, ph = R.next() * Math.PI * 2, dir = R.next() * Math.PI * 2;
        for (let k = 0; k < keys; k++) {
            const t = k / (keys - 1) * LOOP, w = 2 * Math.PI * t / LOOP;
            const x = a * (Math.sin(w + ph) * 0.8 + Math.sin(2 * w) * 0.25), z = a * 0.55 * Math.sin(w + ph + 1.7);
            // The lean about an axis across the wind (`dir`), as a quaternion.
            const ax = [Math.cos(dir) * x - Math.sin(dir) * z, 0, Math.sin(dir) * x + Math.cos(dir) * z], ang = Math.hypot(ax[0], ax[2]) || 1e-9, s = Math.sin(ang / 2) / ang;
            times[k] = t; values.set([ax[0] * s, 0, ax[2] * s, Math.cos(ang / 2)], k * 4);
        }
        return { name: 'Sway', times: Float32Array.from([0, LOOP]), tracks: [{ bone: 1, path: 'rotation', times, values }] };
    }

    // ── the build ──────────────────────────────────────────────────────────
    function build(input, cache = {}, options = {}) {
        const r = normalize(input), f = BY_ID.get(r.form), family = f[4];
        const env = { quick: !!(options.textureSize && options.textureSize < 1024), detail: options.textureSize && options.textureSize < 1024 ? 0.8 : 1 };
        const made = family === 'tree' ? buildTree(r, cache, env) : family === 'plant' ? Plants.build(r, cache, env, { picture, coverParts }) : family === 'rock' ? Rocks.build(r, cache, env, { picture, coverParts }) : Alien.build(r, cache, env, { picture, coverParts });
        const geos = made.parts.map(p => p[0]);
        Kit.ground(geos);
        const sway = r.sway && family !== 'rock' && made.swayDegrees > 0;
        const parts = made.parts.filter(p => Kit.count(p[0])).map(([g, m]) => Kit.part(g, Object.assign({ metalness: 0 }, m, { name: f[1] + ' ' + m.name }), sway));
        let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) for (let d = 0; d < 3; d++) { lo[d] = Math.min(lo[d], p.positions[i + d]); hi[d] = Math.max(hi[d], p.positions[i + d]); }
        const longest = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
        const bones = sway ? [{ name: 'Prop', head: [0, 0, 0], parent: -1 }, { name: 'Wind', head: [0, 0, 0], parent: 0 }] : [{ name: 'Prop', head: [0, 0, 0], parent: -1 }];
        return {
            kind: 'nature', recipe: r, parts, textures: made.textures, bones, clips: sway ? [swayClip(made.swayDegrees, r.seed)] : [], loop: null, cloth: null,
            height: hi[1] - lo[1], placeSize: Math.round(longest / TILE * 10) / 10
        };
    }

    // ── Randomize ──────────────────────────────────────────────────────────
    function random(seed, recipe, scope = 'all') {
        const r = normalize(recipe), R = Kit.roll(seed), f = BY_ID.get(r.form), all = scope === 'all';
        const out = Object.assign({}, r);
        if (all) { const p = f[7][Math.floor(R.next() * f[7].length)]; Object.assign(out, fromPreset(r.form, p[0], { sway: r.sway })); }
        if (all || scope === 'shape') {
            out.seed = 1 + Math.floor(R.next() * 999999);
            const d = presetOf(r.form, out.preset)[2], base = d.size || (f[6][0] + f[6][1]) / 2;
            out.size = clamp(base * (0.8 + R.next() * 0.4), f[6][0], f[6][1]);
            out.spread = clamp(0.15 + R.next() * 0.75, 0, 1); out.character = clamp(0.1 + R.next() * 0.85, 0, 1);
        }
        if (all || scope === 'colors') {
            if (f[4] === 'tree' || f[4] === 'plant') out.season = SEASONS[Math.floor(R.next() * SEASONS.length)][0];
            if (f[4] === 'rock') { out.stone = STONES[Math.floor(R.next() * (STONES.length - 1))][0]; out.cover = COVERS[Math.floor(R.next() * COVERS.length)][0]; }
            if (f[4] === 'alien') { out.palette = PALETTES[Math.floor(R.next() * PALETTES.length)][0]; out.glow = 0.3 + R.next() * 0.7; }
        }
        return normalize(out);
    }

    const api = { FORMS, BY_ID, SEASONS, STONES, COVERS, PALETTES, TILE, LOOP, normalize, fromPreset, build, random, addForms, swayClip, picture, coverParts };
    root.RRNatureProp = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;

    // ── the catalog and the page ───────────────────────────────────────────
    const Model = need('RRPropModel', './PropModel.js'), Catalog = need('RRPropCatalog', './PropCatalog.js');
    Model.register({ id: 'nature', label: 'Nature', normalize, build, random, randomScopes: [['all', 'Everything'], ['shape', 'Shape'], ['colors', 'Colors']] });
    Object.assign(Catalog.ICONS, {
        tree: '<path d="M12 22v-7"/><path d="M12 15l-3-3m3 1l3-3"/><path d="M12 2a5 5 0 0 0-4.6 3A4.5 4.5 0 0 0 5 13.5h14A4.5 4.5 0 0 0 16.6 5 5 5 0 0 0 12 2z"/>',
        conifer: '<path d="M12 2l5 7h-3l4 6h-4l3 4H7l3-4H6l4-6H7z"/><path d="M12 19v3"/>',
        palm: '<path d="M12 22c0-5 1-9 0-13"/><path d="M12 9c-2-3-6-3-8-1m8 1c2-3 6-3 8-1m-8 1c-1-3-4-5-7-5m7 5c1-3 4-5 7-5"/>',
        willow: '<path d="M12 22v-8"/><path d="M12 14c-3-6-8-5-9 2m9-2c3-6 8-5 9 2M7 9v9m3-11v12m4-12v12m3-10v9"/>',
        deadtree: '<path d="M12 22v-9l-4-5M12 13l4-6m-6 3L6 8m10-1l2-3M8 8L7 4m5 9V9"/>',
        baobab: '<path d="M8 22c1-5 0-9 2-13h4c2 4 1 8 2 13z"/><path d="M10 9L7 5m7 4l3-4m-5 4V4"/>',
        blossom: '<path d="M12 22v-8"/><circle cx="12" cy="8" r="5"/><circle cx="9" cy="7" r="1"/><circle cx="14" cy="6" r="1"/><circle cx="13" cy="10" r="1"/>',
        bush: '<path d="M4 18a4 4 0 0 1 2-7 5 5 0 0 1 9-2 4 4 0 0 1 5 5 3 3 0 0 1-1 4z"/><path d="M3 21h18"/>',
        flower: '<circle cx="12" cy="8" r="2"/><path d="M12 6a2 2 0 1 1 2-3 2 2 0 1 1 1 4 2 2 0 1 1-2 3 2 2 0 1 1-3-1 2 2 0 1 1 2-3z"/><path d="M12 10v12m0-5c-2-2-4-2-5-1m5 3c2-2 4-2 5-1"/>',
        fern: '<path d="M12 22C12 14 8 8 4 5"/><path d="M6 7l2-3m1 6l3-3m-1 6l3-2M5 10l1 2m2 1l1 2m1 1l1 2"/><path d="M12 22c0-7 4-12 8-15"/>',
        grass: '<path d="M4 22c2-6 2-12 1-17m4 17c0-6 2-10 5-14M12 22c1-7 0-11-2-16m6 16c0-5 2-9 5-12"/>',
        cactus: '<path d="M10 22V5a2 2 0 0 1 4 0v17M10 13H7a2 2 0 0 1-2-2V8m9 7h3a2 2 0 0 0 2-2v-3"/><path d="M6 22h12"/>',
        succulent: '<path d="M12 20c-4 0-8-2-9-6 3 0 6 2 9 6zm0 0c4 0 8-2 9-6-3 0-6 2-9 6zm0 0c-3-3-4-8-2-12 2 4 3 8 2 12zm0 0c3-3 4-8 2-12-2 4-3 8-2 12z"/>',
        mushroom: '<path d="M4 12a8 7 0 0 1 16 0z"/><path d="M10 12v8a2 2 0 0 0 4 0v-8"/><circle cx="9" cy="8" r="1"/><circle cx="14" cy="7" r="1"/>',
        vine: '<path d="M6 2v20M18 2c0 6-6 6-6 12s6 6 6 8"/><path d="M6 7c2 0 3 1 3 3-2 0-3-1-3-3zm0 8c-2 0-3 1-3 3 2 0 3-1 3-3zm9-5c2 0 3 1 3 3-2 0-3-1-3-3z"/>',
        rock: '<path d="M3 19l3-8 5-4 6 2 4 10z"/><path d="M11 7l1 5 5-3m-5 3l-6-1"/>',
        cliff: '<path d="M5 22V9l3-4h5l2 4 4 2v11"/><path d="M8 5l1 6m4-6l-1 8m-7-2h5m4 4h4"/>',
        stone: '<path d="M8 22V7c0-3 2-5 4-5s4 2 4 5v15"/><path d="M5 22h14m-7-15l-1 4 2 2-1 4"/>',
        arch: '<path d="M3 21V11a9 8 0 0 1 18 0v10h-4v-9a5 5 0 0 0-10 0v9z"/>',
        crystal: '<path d="M12 2l3 7-3 13-3-13z"/><path d="M6 8l2 5-2 9-3-8zm12 0l3 6-3 8-2-9z"/>',
        alien: '<path d="M12 22v-9"/><circle cx="12" cy="8" r="4"/><path d="M12 13c-3 0-6 2-7 5m7-5c3 0 6 2 7 5M10 7h.1m3.9 0h.1"/>',
        lantern: '<path d="M6 22V9a6 5 0 0 1 12 0"/><path d="M18 9v3"/><path d="M16 12h4l-1 5h-2z"/>',
        fungus: '<path d="M11 22V6h2v16"/><path d="M5 9a7 3 0 0 1 14 0zm2 6a5 2 0 0 1 10 0z"/>',
        tentacle: '<path d="M6 22c0-6 3-8 1-13-1-2 1-4 3-3M12 22c0-7 1-11 0-17m6 17c0-6-3-8-1-13 1-2-1-4-3-3"/>',
        coral: '<path d="M12 22v-6m0 0L7 11m5 5l5-5M7 11L5 6m2 5l3-4m7 4l2-5m-2 5l-3-4M12 16V9"/>',
        horn: '<path d="M7 22c0-6 6-8 6-12s-3-6-5-6m4 18c0-4 5-6 6-10"/>'
    });
    Catalog.category({ id: 'nature', label: 'Nature', order: 30 });
    Catalog.category({ id: 'trees', label: 'Trees', order: 31, parent: 'nature' });
    Catalog.category({ id: 'plants', label: 'Bushes & Plants', order: 32, parent: 'nature' });
    Catalog.category({ id: 'rocks', label: 'Rocks', order: 33, parent: 'nature' });
    Catalog.category({ id: 'alien-flora', label: 'Alien Flora', order: 34, parent: 'nature' });
    /** Every form as a catalog type (called again when a family file adds forms). */
    function listForms() {
        for (const f of FORMS) Catalog.add({ id: 'nature-' + f[0], label: f[1], kind: 'nature', category: f[2], icon: f[3], keywords: 'nature ' + f[4] + ' ' + f[7].map(p => p[1]).join(' ') + ' ' + (f[8] || ''), start: () => fromPreset(f[0], f[7][0][0]), matches: r => r.form === f[0] });
    }
    api.listForms = listForms;
    listForms();

    const SWATCH = { spring: '#9ac452', summer: '#4a7a2a', autumn: '#d0701a', bare: '#7a6a5a', snow: '#e8eef6' };
    Catalog.ui('nature', {
        placeholder: 'Nature',
        tabs: [['design', 'Design']],
        panel() {
            const r = this.recipe, f = BY_ID.get(r.form), family = f[4];
            let html = this._section('Kind') + this._tiles('nature-preset', f[7].map(p => ({ id: p[0], label: p[1] })), r.preset, 2);
            html += this._section('Shape')
                + this._slider({ path: 'size', label: family === 'rock' ? 'Size' : 'Height', range: f[6], step: 0.1, format: 'm' })
                + this._slider({ path: 'spread', label: f[5][0], range: [0, 1] })
                + this._slider({ path: 'character', label: f[5][1], range: [0, 1] })
                + `<div class="rr-c3d-row"><button class="rr-btn-chip" data-act="nature-shuffle" title="${rrEscapeHtml(this._t('A new take on the same kind'))}">🎲 ${this._t('Shuffle')}</button></div>`;
            html += this._section('Look');
            if (family === 'rock') html += this._select('stone', 'Stone', STONES) + this._select('cover', 'Cover', COVERS) + (r.form === 'crystal' || r.preset === 'runestone' ? this._select('palette', r.form === 'crystal' ? 'Crystal color' : 'Glow color', PALETTES) + this._slider({ path: 'glow', label: 'Glow', range: [0, 1] }) : '');
            else if (family === 'alien') html += this._select('palette', 'Palette', PALETTES) + this._slider({ path: 'glow', label: 'Glow', range: [0, 1] });
            else html += this._select('season', 'Season', SEASONS);
            if (family !== 'rock') html += this._check('sway', 'Sway in the wind');
            void SWATCH;
            return html;
        },
        act(act, b) {
            const r = this.recipe;
            if (act === 'nature-preset') { this._replace(fromPreset(r.form, b.dataset.id, { seed: r.seed, sway: r.sway })); return; }
            if (act === 'nature-shuffle') this._replace(Object.assign({}, r, { seed: 1 + Math.floor(Math.random() * 999999) }));
        },
        reset: r => fromPreset(r.form, r.preset),
        moves: () => false
    });
})(typeof window !== 'undefined' ? window : globalThis);
