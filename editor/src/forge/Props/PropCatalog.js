/**
 * RRPropCatalog - what the 3D Prop Builder offers to make, in the left
 * column: categories, and in them the types a person picks.
 *
 * A category: { id, label, order, parent? }: one with no parent is a top
 * section of the list (Weapons), one with a parent a short group inside it
 * (Firearms). A type: { id, category, label, icon, kind, start(),
 * matches(recipe), keywords?, hidden? }: `kind` is a model kind
 * registered with RRPropModel (its normalize and build), `start` gives
 * the recipe the type starts from, `matches` says which type a recipe is;
 * a hidden type is not listed (another type makes the same thing) but still
 * names the recipes it matches.
 * A kind's page is registered once with `ui(kind, page)`: { placeholder,
 * tabs: [[id, label]], panel(tab), act?(act, button), choose?(path, value),
 * moves?(recipe), reset(recipe) }, its functions called on the builder (so
 * `this._slider`, `this._select`, `this._color`, `this._check`,
 * `this._tiles` and `this._section` are at hand).
 *
 * A new kind is a file of its own that registers its model, its types and
 * its page here; nothing else changes.
 */
(function(root) {
    'use strict';

    const CATEGORIES = [];
    const TYPES = [];
    const UI = {};

    function category(c) {
        const i = CATEGORIES.findIndex(x => x.id === c.id);
        const entry = Object.assign({ order: 100 }, c);
        if (i >= 0) CATEGORIES[i] = entry; else CATEGORIES.push(entry);
        CATEGORIES.sort((a, b) => a.order - b.order);
        return entry;
    }

    function add(type) {
        const i = TYPES.findIndex(x => x.id === type.id);
        const entry = Object.assign({ matches: () => false, keywords: '' }, type);
        if (i >= 0) TYPES[i] = entry; else TYPES.push(entry);
        return entry;
    }

    function ui(kind, page) { UI[kind] = page; return page; }

    /** The type a recipe is: the first of its kind that says so, else the first of its kind. */
    function typeOf(recipe) {
        const kind = recipe && recipe.kind;
        return TYPES.find(t => t.kind === kind && t.matches(recipe)) || TYPES.find(t => t.kind === kind) || null;
    }

    /**
     * The list as shown: each top category with the types right in it and
     * its groups ({ category, types }), only types matching `query` (by
     * label, keywords, group or section), empty groups and sections left out.
     * `types` of a section is every type it shows, its groups' included.
     */
    function grouped(query, translate) {
        const t = translate || (s => s);
        const q = String(query || '').trim().toLowerCase();
        const fits = (x, ...cats) => {
            if (x.hidden) return false;
            if (!q) return true;
            const words = [t(x.label), x.label, x.keywords, ...cats.flatMap(c => [t(c.label), c.label])].join(' ').toLowerCase();
            return q.split(/\s+/).every(w => words.includes(w));
        };
        return CATEGORIES.filter(c => !c.parent).map(top => {
            const own = TYPES.filter(x => x.category === top.id && fits(x, top));
            const groups = CATEGORIES.filter(c => c.parent === top.id).map(g => ({ category: g, types: TYPES.filter(x => x.category === g.id && fits(x, g, top)) })).filter(g => g.types.length);
            return { category: top, own, groups, types: own.concat(...groups.map(g => g.types)) };
        }).filter(g => g.types.length);
    }

    /** The top section a category sits in. */
    function topOf(id) { let c = CATEGORIES.find(x => x.id === id); while (c && c.parent) c = CATEGORIES.find(x => x.id === c.parent); return c || null; }

    /** Small line icons (24 x 24, currentColor) the types are shown with. */
    const ICONS = {
        car: '<path d="M3 12l2-5h14l2 5v6H3zM3 12h18M7 18v3m10-3v3M6 15h2m8 0h2"/>',
        motorcycle: '<circle cx="5" cy="17" r="4"/><circle cx="19" cy="17" r="4"/><path d="M5 17l5-8 5 8H5m9-13h3l2 13M7 9h6"/>',
        aircraft: '<path d="M12 2l3 8 7 4v3l-8-2v5l3 2H7l3-2v-5l-8 2v-3l7-4z"/>',
        walker: '<path d="M8 3h8l3 8H5zM9 11v5l-3 5H3m12-10v5l3 5h3M5 7H2v8m17-8h3v8"/>',
        chair: '<path d="M6 13V4h12v9M4 13h16v4H4zM6 17v4m12-4v4"/>',
        sofa: '<path d="M5 11V6h14v5M3 10h3v7h12v-7h3v9H3zM5 19v2m14-2v2M6 14h12m-6-8v8"/>',
        table: '<path d="M2 8h20v4H2zM5 12v9m14-9v9M5 17h14"/>',
        bed: '<path d="M3 19V5h18v14M3 12h18v5H3m3-5V8h5v4m2 0V8h5v4M5 19v2m14-2v2"/>',
        cabinet: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3v18M9 11v3m6-3v3"/>',
        appliance: '<rect x="5" y="2" width="14" height="20" rx="1"/><path d="M5 9h14M8 5v2m0 5v4"/>',
        screen: '<rect x="2" y="3" width="20" height="14" rx="1"/><path d="M12 17v4m-5 0h10M6 8h7m-7 4h12"/>',
        console: '<path d="M4 3h7v7H4zm9 0h7v7h-7zM4 12h16l2 5H2zM4 17v5m16-5v5M7 14h2m3 0h2m3 0h1"/>',
        server: '<rect x="5" y="2" width="14" height="20" rx="1"/><path d="M5 8h14M5 15h14M8 5h5m-5 6h5m-5 7h5m3-13h.1m-.1 6h.1m-.1 7h.1"/>',
        crate: '<path d="M3 6l9-4 9 4v13l-9 3-9-3zM3 6l9 4 9-4M12 10v12M3 12l9 4 9-4"/>',
        equipment: '<path d="M8 5l4-2 4 2 5 4-3 4-2-1v9H8v-9l-2 1-3-4z"/>',
        flag: '<path d="M5 21V3"/><path d="M5 4c3-1.5 5 1.5 8 0s4.5-.5 6 .5v8c-1.5-1-3-1.5-6 0s-5-1.5-8 0"/>',
        streamer: '<path d="M5 21V3"/><path d="M5 4c4 0 7 2 15 4-8 1-11 3-15 4"/>',
        banner: '<path d="M5 21V3"/><path d="M5 4h7v15l-3.5-3L5 19z"/>',
        hanging: '<path d="M2 5h20"/><path d="M5 5v9l2-2 2 2V5"/><path d="M11 5v12l2-2 2 2V5"/><path d="M17 5v8l2-2 2 2V5"/>',
        cutout: '<path d="M7 20l2-6-4-4 5-1 2-5 2 5 5 1-4 4 2 6-5-3z"/>',
        turned: '<path d="M9 3h6"/><path d="M10 3c0 3-4 5-4 10s3 8 6 8 6-3 6-8-4-7-4-10"/>',
        framed: '<rect x="3" y="4" width="18" height="16" rx="1"/><rect x="7" y="8" width="10" height="8"/>',
        sword: '<path d="M14 4l6-1-1 6-9 9"/><path d="M6 14l4 4"/><path d="M8 16l-4 4"/>',
        dagger: '<path d="M15 5l4-1-1 4-6 6"/><path d="M9 12l3 3"/><path d="M10.5 13.5L6 18"/>',
        curved: '<path d="M19 3c-1 6-5 10-10 12"/><path d="M7 13l4 4"/><path d="M9 15l-4 4"/>',
        pistol: '<path d="M3 8h17v4H11l-1 2H8l-1 5H4l1-7H3z"/>',
        rifle: '<path d="M2 10h14l6-1v3H12l-2 2H7l-1 3H3l1-4H2z"/>',
        shotgun: '<path d="M2 9h20v2H2z"/><path d="M8 11v2l-3 4H3l2-6"/>',
        blaster: '<path d="M3 8h14l3 2-3 2H11l-1 2H8l-1 5H4l1-7H3z"/><path d="M20 10h2"/>',
        cannon: '<rect x="3" y="8" width="14" height="6" rx="2"/><path d="M17 10h5v2h-5"/><path d="M7 14l-1 5h3l1-5"/>'
    };
    function icon(name, size) {
        const body = ICONS[name] || ICONS.flag, s = size || 16;
        return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
    }

    // The categories this builder starts with; more slot in by order (furniture, containers, lights...).
    category({ id: 'banners', label: 'Banners & Flags', order: 10 });
    category({ id: 'picture', label: 'From Picture', order: 20 });
    category({ id: 'weapons', label: 'Weapons', order: 40 });
    category({ id: 'swords', label: 'Swords & Blades', order: 41, parent: 'weapons' });
    category({ id: 'firearms', label: 'Firearms', order: 42, parent: 'weapons' });
    category({ id: 'scifi', label: 'Sci-fi', order: 43, parent: 'weapons' });
    category({ id: 'wearables', label: 'Wearables', order: 60 });
    category({ id: 'gear', label: 'Tools & Gear', order: 70 });

    const api = { CATEGORIES, TYPES, UI, ICONS, category, add, ui, typeOf, grouped, topOf, icon };
    root.RRPropCatalog = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
