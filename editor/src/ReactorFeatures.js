/**
 * ReactorFeatures - the registry of Reactor's own additions over RPG Maker MZ
 * that a plugin may also provide (docs/REACTOR-FEATURES.md).
 *
 * Each feature is one record: an id, a label, Basic or Advanced, the
 * System.json flag that switches it, its default (what a project that never
 * touched the flag gets, which is how Reactor behaved before the registry),
 * the plugins known to do the same job, and a short description.
 *
 * A flag under `rrFeatures.` is stored only while it differs from the
 * default, so a project that never opened the page keeps a clean System.json.
 * A feature with an older flag of its own (rrMultiFrames, rrSkipTitle,
 * rrHigherLimits) keeps that flag, stored only while on, as the System 2 page stores it.
 *
 * The game reads the same flags through runtime/reactor_features.js
 * (ReactorFeatures.on(id)); a test keeps the two tables in step.
 *
 * Database › Reactor Features lists them (DatabaseFeaturesEditor), and the
 * Database's pages ask ReactorFeatures.on(id, system) before drawing a
 * feature's fields.
 */
(function(root) {
    'use strict';

    // `plugins`: names as they appear in the Plugin Manager (the file name
    // without .js). A `*` matches any run of characters, so 'Galv_QuestLog*'
    // matches Galv_QuestLog and Galv_QuestLogMZ. Matching ignores case.
    // `pending: true`: registered for a feature still being built; the page
    // leaves it out until its fields and game code ask the registry.
    const FEATURES = [
        {
            id: 'classEquipSlots', tier: 'basic', flag: 'rrFeatures.classEquipSlots', default: true,
            label: 'Class Equipment Slots',
            description: 'Each class lists its own equipment slots, repeating a type for extra slots.',
            plugins: ['VisuMZ_1_ItemsEquipsCore', 'YEP_EquipCore']
        },
        {
            id: 'quests', tier: 'basic', flag: 'rrFeatures.quests', default: true,
            label: 'Quests',
            description: 'The quest log, the on-map tracker and the quest commands of Database › Quests.',
            // VisuMZ_2_QuestSystem is not listed: Database › Quests can write into it (its Quest Log choice).
            plugins: ['YEP_QuestJournal', 'GS_QuestSystem', 'Galv_QuestLog*', 'MOG_QuestSystem']
        },
        {
            id: 'mapLighting2D', tier: 'basic', flag: 'rrFeatures.mapLighting2D', default: true,
            label: '2D Map Lighting',
            description: 'Lights placed with the Lighting tool, drawn on 2D maps.',
            plugins: ['Community_Lighting*', 'TerraxLighting*', 'Terrax_Lighting*', 'KhasUltraLighting', 'OcRam_Lights', 'VisuMZ_2_LightingEffects']
        },
        {
            id: 'unsellableItems', tier: 'basic', flag: 'rrFeatures.unsellableItems', default: true,
            label: 'Unsellable Items',
            description: 'Items and equipment marked as not for sale.',
            plugins: ['VisuMZ_1_ItemsEquipsCore', 'YEP_ShopMenuCore']
        },
        {
            id: 'enemyRanges', tier: 'basic', flag: 'rrFeatures.enemyRanges', default: true,
            label: 'Enemy Ranges',
            description: 'Enemy stats that vary from battle to battle, and drop amounts in a range.',
            plugins: ['YEP_EnemyLevels', 'VisuMZ_3_EnemyLevels', 'YEP_ExtraEnemyDrops', 'VisuMZ_3_ExtraEnemyDrops']
        },
        {
            id: 'spriteTransforms', tier: 'basic', flag: 'rrFeatures.spriteTransforms', default: true,
            label: 'Sprite Transforms',
            description: 'Mirror, flip and rotate characters and events.',
            plugins: ['VisuMZ_1_EventsMoveCore', 'MOG_CharacterMotion']
        },
        {
            id: 'mapBattles', tier: 'advanced', flag: 'rrFeatures.mapBattles', default: true,
            label: 'On-Map Battles',
            description: 'Tactical, Action and First Person battles on the map. Off, every battle uses the battle screen.',
            plugins: ['SRPG_core*', 'AlphaABS*', 'Alpha_ABS*', 'QABS', 'MOG_ChronoEngine']
        },
        {
            id: 'equipSlotLayouts', tier: 'advanced', flag: 'rrFeatures.equipSlotLayouts', default: true,
            label: 'Equipment Slot Layouts',
            description: 'Named slot layouts shared between classes.',
            plugins: ['VisuMZ_1_ItemsEquipsCore', 'YEP_EquipCore']
        },
        {
            // Opt-in, and its own older flag: it was System 2's Limits checkbox, and this tick replaces it.
            id: 'higherLimits', tier: 'advanced', flag: 'rrHigherLimits', default: false,
            label: 'Higher Limits',
            description: 'Off keeps the RPG Maker MZ limits: 99 of each item and 99,999,999 gold. On allows 9,999 of each item and 9,999,999,999 gold.',
            plugins: ['VisuMZ_0_CoreEngine', 'YEP_CoreEngine', 'YEP_BaseParamControl']
        },
        {
            id: 'multiFrames', tier: 'advanced', flag: 'rrMultiFrames', default: false,
            label: 'Multi-frame Sheets ([NF])',
            description: 'Character sheets named with [NF] have N walking frames.',
            plugins: ['Galv_CharacterFrames*', 'GALV_CharacterFrames*']
        },
        {
            id: 'skipTitle', tier: 'advanced', flag: 'rrSkipTitle', default: false,
            label: 'Skip Title Screen',
            description: 'The game starts on the first map, without the title screen.',
            plugins: ['*SkipTitle*', '*TitleSkip*']
        }
    ];

    const byId = new Map(FEATURES.map(feature => [feature.id, feature]));

    function readPath(system, path) {
        let value = system;
        for (const key of path.split('.')) {
            if (!value || typeof value !== 'object') return undefined;
            value = value[key];
        }
        return value;
    }

    /** Whether a feature is on in this System.json (absent: its default). An unknown id is on: nothing gates it. */
    function on(id, system) {
        const feature = byId.get(id);
        if (!feature) return true;
        const sys = system !== undefined ? system : (typeof root.$dataSystem !== 'undefined' ? root.$dataSystem : null);
        const value = sys ? readPath(sys, feature.flag) : undefined;
        if (value === undefined || value === null) return feature.default;
        return !!value;
    }

    /**
     * Switch a feature in a System.json. Kept only while it differs from the
     * default (an `rrFeatures` left empty goes too), so stock stays stock.
     * Returns whether anything changed.
     */
    function set(id, enabled, system) {
        const feature = byId.get(id);
        if (!feature || !system || typeof system !== 'object') return false;
        const want = !!enabled;
        const before = readPath(system, feature.flag);
        const keys = feature.flag.split('.');
        let owner = system;
        for (const key of keys.slice(0, -1)) {
            if (!owner[key] || typeof owner[key] !== 'object') owner[key] = {};
            owner = owner[key];
        }
        const last = keys[keys.length - 1];
        if (want === feature.default) delete owner[last]; else owner[last] = want;
        if (keys.length === 2 && Object.keys(system[keys[0]]).length === 0) delete system[keys[0]];
        return readPath(system, feature.flag) !== before;
    }

    function patternMatches(pattern, name) {
        const source = '^' + String(pattern).split('*').map(part => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$';
        return new RegExp(source, 'i').test(String(name || ''));
    }

    /** The enabled plugins of a $plugins list ({name, status}) that provide a feature, by name. */
    function providers(id, plugins) {
        const feature = byId.get(id);
        if (!feature || !Array.isArray(plugins)) return [];
        const out = [];
        for (const plugin of plugins) {
            if (!plugin || plugin.status === false || !plugin.name) continue;
            if (feature.plugins.some(pattern => patternMatches(pattern, plugin.name)) && !out.includes(plugin.name)) out.push(plugin.name);
        }
        return out;
    }

    /** Every listed feature with the plugins providing it: [{ feature, plugins }] for those with any. */
    function overlaps(plugins, { includePending = false } = {}) {
        return FEATURES.filter(feature => includePending || !feature.pending)
            .map(feature => ({ feature, plugins: providers(feature.id, plugins) }))
            .filter(entry => entry.plugins.length);
    }

    /** The features the page lists, in order, Basic first. */
    function listed({ includePending = false } = {}) {
        const shown = FEATURES.filter(feature => includePending || !feature.pending);
        return shown.filter(f => f.tier === 'basic').concat(shown.filter(f => f.tier !== 'basic'));
    }

    /**
     * The project's plugin list, read from js/reactor_plugins.js (a Reactor
     * project) or js/plugins.js. Empty when there is none or it cannot be read.
     */
    function readProjectPlugins(projectPath, fs, path) {
        if (!projectPath || !fs || !path) return [];
        try {
            const js = path.join(projectPath, 'js');
            const reactor = fs.existsSync(path.join(js, 'reactor_main.js'));
            const file = path.join(js, reactor ? 'reactor_plugins.js' : 'plugins.js');
            if (!fs.existsSync(file)) return [];
            const text = fs.readFileSync(file, 'utf8');
            // The Plugin Manager's reader (a class, so a global name rather than a property of window).
            const manager = typeof PluginManager !== 'undefined' ? PluginManager : null;
            const parse = manager && typeof manager.parsePluginsManifest === 'function' ? manager.parsePluginsManifest : parseManifest;
            return parse(text);
        } catch (error) {
            return [];
        }
    }

    /** A plain reader of `$plugins = [...]`, for when the Plugin Manager's is not loaded (tests, tools). */
    function parseManifest(text) {
        const source = String(text || '');
        const at = source.search(/\$plugins\s*=\s*\[/);
        if (at < 0) return [];
        const start = source.indexOf('[', at);
        const end = source.lastIndexOf(']');
        if (end <= start) return [];
        const list = JSON.parse(source.slice(start, end + 1));
        return Array.isArray(list) ? list : [];
    }

    const api = { FEATURES, get: id => byId.get(id) || null, on, set, providers, overlaps, listed, readProjectPlugins, patternMatches };
    root.ReactorFeatures = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
