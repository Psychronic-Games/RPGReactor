/**
 * Pure database-reference lookup for RPG Maker plugin parameter types.
 */
(function(root) {
    'use strict';

    const RECORD_SOURCES = Object.freeze({
        actor: 'actors',
        class: 'classes',
        skill: 'skills',
        item: 'items',
        weapon: 'weapons',
        armor: 'armors',
        enemy: 'enemies',
        troop: 'troops',
        state: 'states',
        animation: 'animations',
        tileset: 'tilesets',
        common_event: 'commonEvents'
    });

    const SYSTEM_SOURCES = Object.freeze({
        switch: 'switches',
        variable: 'variables',
        element: 'elements',
        skill_type: 'skillTypes',
        weapon_type: 'weaponTypes',
        armor_type: 'armorTypes',
        equip_type: 'equipTypes'
    });

    const TYPE_LABELS = Object.freeze({
        actor: 'Actor', class: 'Class', skill: 'Skill', item: 'Item',
        weapon: 'Weapon', armor: 'Armor', enemy: 'Enemy', troop: 'Troop',
        state: 'State', animation: 'Animation', tileset: 'Tileset',
        common_event: 'Common Event', switch: 'Switch', variable: 'Variable',
        element: 'Element', skill_type: 'Skill Type', weapon_type: 'Weapon Type',
        armor_type: 'Armor Type', equip_type: 'Equip Type'
    });

    const baseType = type => String(type || '').trim().toLowerCase().replace(/\[\]$/, '');

    const sourceFor = type => {
        const kind = baseType(type);
        if (Object.prototype.hasOwnProperty.call(RECORD_SOURCES, kind)) {
            return { type: kind, scope: 'data', property: RECORD_SOURCES[kind] };
        }
        if (Object.prototype.hasOwnProperty.call(SYSTEM_SOURCES, kind)) {
            return { type: kind, scope: 'system', property: SYSTEM_SOURCES[kind] };
        }
        return null;
    };

    const isRefType = type => sourceFor(type) !== null;

    const iconIndexFor = value => {
        const match = /\\I\[(\d+)\]/i.exec(String(value ?? ''));
        return match ? Number(match[1]) : 0;
    };

    const stripTextCodes = value => String(value ?? '')
        .replace(/\\[A-Za-z]{1,8}(?:\[[^\]]*\])?/g, '')
        .replace(/\\[{}|.^!><$]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const parseId = value => {
        if (typeof value === 'number') {
            return Number.isSafeInteger(value) && value >= 0 ? value : null;
        }
        const raw = String(value ?? '').trim();
        if (!/^(?:0|[1-9]\d*)$/.test(raw)) return null;
        const id = Number(raw);
        return Number.isSafeInteger(id) ? id : null;
    };

    const editorNameFor = (options, details) => {
        if (!options || typeof options.editorName !== 'function') return '';
        return stripTextCodes(options.editorName(details) ?? '');
    };

    const makeEntry = (source, id, rawName, rawEntry, options) => {
        const name = stripTextCodes(rawName);
        const editorName = editorNameFor(options, {
            type: source.type,
            source: source.property,
            id,
            entry: rawEntry
        });
        const editorFirst = Boolean(options && options.editorNameFirst && editorName);
        return {
            id,
            name,
            editorName,
            primary: editorFirst ? editorName : name,
            secondary: editorFirst ? name : editorName,
            iconIndex: iconIndexFor(rawName),
            searchText: [id, name, editorName].filter(Boolean).join(' ')
        };
    };

    /** Enumerate entries by array index; System-list blank slots remain IDs. */
    function entriesFor(type, database, options = {}) {
        const source = sourceFor(type);
        const data = database && database.data;
        if (!source || !data) return [];
        const list = source.scope === 'system'
            ? data.system && data.system[source.property]
            : data[source.property];
        if (!Array.isArray(list)) return [];

        const entries = [];
        for (let id = 1; id < list.length; id++) {
            const raw = list[id];
            if (source.scope === 'data') {
                if (!raw || typeof raw !== 'object') continue;
                entries.push(makeEntry(source, id, raw.name, raw, options));
            } else {
                entries.push(makeEntry(source, id, raw, raw, options));
            }
        }
        return entries;
    }

    const hasEntries = (type, database) => entriesFor(type, database).length > 0;

    /** Strictly resolve a non-negative integer ID; zero deliberately has no entry. */
    function resolve(type, database, value, options = {}) {
        const id = parseId(value);
        if (id === null || id === 0) return null;
        const source = sourceFor(type);
        const data = database && database.data;
        if (!source || !data) return null;
        const list = source.scope === 'system'
            ? data.system && data.system[source.property]
            : data[source.property];
        if (!Array.isArray(list) || id >= list.length) return null;
        const raw = list[id];
        if (source.scope === 'data' && (!raw || typeof raw !== 'object')) return null;
        return makeEntry(source, id, source.scope === 'data' ? raw.name : raw, raw, options);
    }

    const padId = id => String(id).padStart(4, '0');

    function labelForEntry(entry, unnamed = 'Unnamed') {
        if (!entry) return '';
        const primary = entry.primary || unnamed;
        const secondary = entry.secondary && entry.secondary !== primary ? ` (${entry.secondary})` : '';
        return `${padId(entry.id)}: ${primary}${secondary}`;
    }

    /** Describe blank, zero, known, unnamed, malformed, or missing stored IDs. */
    function describe(type, database, value, options = {}) {
        const raw = String(value ?? '').trim();
        if (!raw) return '';
        const id = parseId(value);
        if (id === 0) return options.none || '(None)';
        if (id === null) return options.missing || '(missing)';
        const entry = resolve(type, database, id, options);
        return entry
            ? labelForEntry(entry, options.unnamed || 'Unnamed')
            : options.missing || '(missing)';
    }

    const typeLabel = type => TYPE_LABELS[baseType(type)] || '';

    const api = {
        RECORD_SOURCES,
        SYSTEM_SOURCES,
        baseType,
        sourceFor,
        isRefType,
        iconIndexFor,
        stripTextCodes,
        parseId,
        entriesFor,
        hasEntries,
        resolve,
        labelForEntry,
        describe,
        typeLabel
    };

    root.RRPluginDataRefs = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
