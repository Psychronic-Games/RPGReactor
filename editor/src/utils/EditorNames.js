/**
 * Editor-only names for player-facing database entries.
 *
 * The store is kept outside RPG Maker's database files so these labels never
 * become game data. Disk access belongs to DatabaseManager; this module only
 * owns the sidecar's data shape.
 */
(function(root) {
    const FILENAME = 'Database.names.json';
    const VERSION = 1;
    const SECTIONS = Object.freeze([
        'actors', 'classes', 'skills', 'items', 'weapons', 'armors', 'enemies', 'states'
    ]);
    const supported = new Set(SECTIONS);

    const create = () => {
        const data = { version: VERSION };
        for (const section of SECTIONS) data[section] = {};
        return data;
    };

    const idKey = value => {
        const id = Number(value);
        return Number.isSafeInteger(id) && id > 0 ? String(id) : null;
    };

    const normalize = data => {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return create();

        // Start with the source so sections introduced by newer editor versions
        // survive an open/save cycle in this one.
        const normalized = { ...data, version: VERSION };
        for (const section of SECTIONS) {
            const source = data[section];
            const kept = {};
            if (source && typeof source === 'object' && !Array.isArray(source)) {
                for (const [rawId, rawName] of Object.entries(source)) {
                    const id = idKey(rawId);
                    const name = typeof rawName === 'string' ? rawName.trim() : '';
                    if (id && name) kept[id] = name;
                }
            }
            normalized[section] = kept;
        }
        return normalized;
    };

    const isEmpty = data => SECTIONS.every(section => {
        const names = data && data[section];
        if (!names || typeof names !== 'object' || Array.isArray(names)) return true;
        return !Object.entries(names).some(([id, value]) =>
            idKey(id) && typeof value === 'string' && value.trim());
    });

    const get = (data, section, id) => {
        const key = idKey(id);
        if (!supported.has(section) || !key) return '';
        const value = data && data[section] && data[section][key];
        return typeof value === 'string' ? value.trim() : '';
    };

    const set = (data, section, id, value) => {
        const store = data && typeof data === 'object' && !Array.isArray(data) ? data : create();
        const key = idKey(id);
        if (!supported.has(section) || !key) return store;
        if (!store[section] || typeof store[section] !== 'object' || Array.isArray(store[section])) {
            store[section] = {};
        }
        const name = typeof value === 'string' ? value.trim() : '';
        if (name) store[section][key] = name;
        else delete store[section][key];
        return store;
    };

    /** Remove names that no longer have a live database entry. */
    const prune = (data, section, entriesOrMaximum) => {
        const store = data && typeof data === 'object' && !Array.isArray(data) ? data : create();
        if (!supported.has(section) || !store[section] || typeof store[section] !== 'object') {
            return store;
        }
        const entries = Array.isArray(entriesOrMaximum) ? entriesOrMaximum : null;
        const maximum = Number.isInteger(entriesOrMaximum) ? entriesOrMaximum : null;
        for (const rawId of Object.keys(store[section])) {
            const key = idKey(rawId);
            const id = Number(key);
            if (!key || (entries && !entries[id]) || (maximum !== null && id > maximum)) {
                delete store[section][rawId];
            }
        }
        return store;
    };

    const api = { FILENAME, VERSION, SECTIONS, create, normalize, isEmpty, get, set, prune };
    root.RREditorNames = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
