// RPG Reactor - Global Search
//
// One field that finds anything in the project and the editor: database
// records, maps, map events and the text inside their commands, common
// events, switches, variables, plugins, menu commands, settings, database
// pages and Forge tools. Picking a result goes there.
//
// The index is built the first time the field opens and kept in memory, in
// groups (one per database type, one per map, ...). A group is rebuilt only
// when it is marked stale: editing anywhere outside the field marks the
// project's groups stale, a map edit marks that map's group stale, a language
// change the editor's. Map files are read a few at a time between frames,
// so opening the field never waits on a large project.
//
// Matching is a case-insensitive substring match that ranks name hits above
// ID hits above content hits. A query that extends the previous one only
// searches the previous matches.
//
// The pure part (entry building, scoring, search) runs in Node for the tests:
//   const GS = require('./GlobalSearch.js'); GS.search(entries, 'potion')

(function (root) {
    'use strict';

    const DATABASE_TYPES = [
        ['actors', 'Actors'], ['classes', 'Classes'], ['skills', 'Skills'], ['items', 'Items'],
        ['weapons', 'Weapons'], ['armors', 'Armors'], ['enemies', 'Enemies'], ['troops', 'Troops'],
        ['states', 'States'], ['animations', 'Animations'], ['tilesets', 'Tilesets'], ['commonEvents', 'Common Events'],
        // Reactor's own Database pages that list records.
        ['vehicles', 'Vehicles'], ['actionSequences', 'Action Sequences'], ['userInterfaces', 'User Interfaces'],
        ['quests', 'Quests'], ['structures', 'Structures'], ['musicSequences', 'Music Sequences']
    ];

    // Where each Database page keeps its records (read only: nothing is created on the way, so
    // indexing never marks the database changed). Vehicles also list the three stock ones,
    // the way DatabaseVehicleEditor.listEntries does.
    const STOCK_VEHICLES = [{ id: -3, name: 'Boat', stockVehicle: 'boat' }, { id: -2, name: 'Ship', stockVehicle: 'ship' }, { id: -1, name: 'Airship', stockVehicle: 'airship' }];
    function databaseRecords(type, data) {
        if (!data) return [];
        if (type === 'musicSequences') return (data.system && data.system.reactorMusicSequences) || [];
        if (type === 'vehicles') return [...STOCK_VEHICLES, ...(Array.isArray(data.vehicles) ? data.vehicles : [])];
        return Array.isArray(data[type]) ? data[type] : [];
    }

    /** A record as the Database list numbers it: "0009: Rhea Voss" (stock vehicles have no number). */
    function recordLabel(id, name) {
        return Number(id) > 0 ? `${String(id).padStart(4, '0')}: ${name}` : String(name);
    }

    // Continuation rows belong to the command that opens them: a hit on a line of
    // message text selects the Show Text it is part of.
    const CONTINUATION_PARENT = { 401: 101, 405: 105, 408: 108, 655: 355, 657: 357 };

    // Groups, in the order a tie between their best results is broken.
    const GROUP_ORDER = ['editor', 'dbPages', 'settings', 'forge', 'db', 'maps', 'mapEvents', 'commonEventCommands',
        'mapEventCommands', 'switches', 'variables', 'plugins'];
    // Each Database type is a group of its own ("db:skills"), ranked where the Database stands.
    const groupRank = key => GROUP_ORDER.indexOf(String(key).startsWith('db:') ? 'db' : key)
        + (String(key).startsWith('db:') ? DATABASE_TYPES.findIndex(([type]) => `db:${type}` === key) / 100 : 0);

    const lower = text => String(text == null ? '' : text).toLowerCase();

    /** Every string inside a command's parameters (plugin command arguments included), joined. */
    function commandStrings(command) {
        const out = [];
        const walk = (value, depth) => {
            if (depth > 4 || value == null) return;
            if (typeof value === 'string') { if (value) out.push(value); return; }
            if (Array.isArray(value)) { value.forEach(v => walk(v, depth + 1)); return; }
            if (typeof value === 'object') Object.keys(value).forEach(k => walk(value[k], depth + 1));
        };
        // Move routes (205) carry scripts inside their own command list.
        walk(command && command.parameters, 0);
        return out.join(' ');
    }

    /**
     * The text of a command list, one row per command a person would select:
     * continuation lines are folded into the command they continue.
     * Returns [{ index, code, text }].
     */
    function commandTexts(list) {
        const rows = [];
        if (!Array.isArray(list)) return rows;
        let open = null;
        for (let index = 0; index < list.length; index++) {
            const command = list[index];
            if (!command || command.code === 0) { open = null; continue; }
            const text = commandStrings(command).trim();
            const parentCode = CONTINUATION_PARENT[command.code];
            if (parentCode && open && open.code === parentCode) {
                if (text) open.text = open.text ? `${open.text} ${text}` : text;
                continue;
            }
            open = { index, code: command.code, text };
            rows.push(open);
        }
        return rows.filter(row => row.text);
    }

    function snippet(text, query, width = 70) {
        const value = String(text || '').replace(/\s+/g, ' ');
        if (!query) return value.slice(0, width);
        const at = value.toLowerCase().indexOf(query);
        if (at < 0 || value.length <= width) return value.slice(0, width);
        const start = Math.max(0, at - Math.floor(width / 3));
        return (start > 0 ? '…' : '') + value.slice(start, start + width) + (start + width < value.length ? '…' : '');
    }

    /** One searchable entry. `n` the lower-case name, `i` the ID as text, `c` lower-case content. */
    function entry(group, title, fields) {
        const e = { group, title: String(title || ''), n: lower(title), i: '', c: '', sub: '', target: null };
        return Object.assign(e, fields);
    }

    /**
     * One group per Database type (`db:<type>`, headed by `label`). `editorName(id)` gives the
     * name the editor shows beside the game's own, when it keeps one: it matches like the name.
     */
    function databaseEntries(type, records, label, editorName) {
        const out = [];
        if (!Array.isArray(records)) return out;
        const group = `db:${type}`;
        for (const record of records) {
            if (!record || !record.id) continue;
            const name = record.name || '';
            const alt = (editorName && editorName(record.id)) || '';
            const shown = name || alt || `#${record.id}`;
            out.push(entry(group, shown, {
                label: recordLabel(record.id, shown) + (alt && name ? ` (${alt})` : ''),
                a: alt && name ? lower(alt) : '',
                i: Number(record.id) > 0 ? String(record.id) : '', c: lower(record.note || ''), kind: label, groupLabel: label,
                // The group's header names the type: the row needs no second label.
                sub: '', target: { kind: 'database', type, id: record.id }
            }));
            if (type === 'commonEvents') {
                for (const row of commandTexts(record.list)) {
                    out.push(entry('commonEventCommands', name || `#${record.id}`, {
                        label: recordLabel(record.id, name || `#${record.id}`),
                        c: lower(row.text), raw: row.text, sub: label,
                        target: { kind: 'commonEvent', id: record.id, command: row.index }
                    }));
                }
            }
        }
        return out;
    }

    /** The 3D Models page's models (ModelGraphicPicker.listModels: "Folder/Name"), selected by name. */
    function modelEntries(models, label) {
        const out = [];
        for (const model of Array.isArray(models) ? models : []) {
            if (!model || !model.name) continue;
            const cut = model.name.lastIndexOf('/');
            const short = cut >= 0 ? model.name.slice(cut + 1) : model.name;
            out.push(entry('db:reactor3d', short, {
                a: lower(model.name), groupLabel: label, sub: cut >= 0 ? model.name.slice(0, cut) : '',
                target: { kind: 'model', name: model.name }
            }));
        }
        return out;
    }

    function mapEntries(mapInfos) {
        const out = [];
        if (!Array.isArray(mapInfos)) return out;
        for (const info of mapInfos) {
            if (!info || !info.id) continue;
            out.push(entry('maps', info.name || `MAP${String(info.id).padStart(3, '0')}`, {
                i: String(info.id), sub: `MAP${String(info.id).padStart(3, '0')}`,
                target: { kind: 'map', mapId: info.id }
            }));
        }
        return out;
    }

    function mapEventEntries(mapId, mapName, map) {
        const out = [];
        if (!map || !Array.isArray(map.events)) return out;
        const where = mapName || `MAP${String(mapId).padStart(3, '0')}`;
        for (const event of map.events) {
            if (!event || !event.id) continue;
            const name = event.name || `EV${String(event.id).padStart(3, '0')}`;
            // Shown as the Events list shows it (012: Rhea Voss); matched and ranked by the name alone.
            const label = `${String(event.id).padStart(3, '0')}: ${name}`;
            out.push(entry('mapEvents', name, {
                label, i: String(event.id), c: lower(event.note || ''),
                sub: `${where} · EV${String(event.id).padStart(3, '0')} (${event.x},${event.y})`,
                target: { kind: 'mapEvent', mapId, eventId: event.id }
            }));
            (event.pages || []).forEach((page, pageIndex) => {
                for (const row of commandTexts(page && page.list)) {
                    out.push(entry('mapEventCommands', name, {
                        label, c: lower(row.text), raw: row.text, page: pageIndex + 1,
                        sub: `${where} · EV${String(event.id).padStart(3, '0')}`,
                        target: { kind: 'mapEvent', mapId, eventId: event.id, page: pageIndex, command: row.index }
                    }));
                }
            });
        }
        return out;
    }

    function systemEntries(system) {
        const out = [];
        if (!system) return out;
        for (const [key, group, kind] of [['switches', 'switches', 'switch'], ['variables', 'variables', 'variable']]) {
            const names = Array.isArray(system[key]) ? system[key] : [];
            for (let id = 1; id < names.length; id++) {
                if (!names[id]) continue;
                out.push(entry(group, names[id], {
                    i: String(id), sub: `#${String(id).padStart(4, '0')}`, target: { kind, id }
                }));
            }
        }
        return out;
    }

    function pluginEntries(plugins) {
        const out = [];
        (Array.isArray(plugins) ? plugins : []).forEach((plugin, index) => {
            if (!plugin || !plugin.name) return;
            out.push(entry('plugins', plugin.name, {
                c: lower(plugin.description || ''), sub: plugin.description || '',
                target: { kind: 'plugin', name: plugin.name, index }
            }));
        });
        return out;
    }

    /**
     * How well an entry matches. `q` is the lower-case query, `tokens` its
     * words. Name hits rank above ID hits above content hits. Every score
     * here stays above zero for a longer query only if it did for its prefix,
     * so a narrowing query may search the previous matches only.
     */
    function nameScore(name, q, tokens) {
        if (!name) return 0;
        if (name === q) return 1000;
        if (name.startsWith(q)) return 800;
        const at = name.indexOf(q);
        if (at > 0) return /[\s\-_.:/([]/.test(name[at - 1]) ? 600 : 400;
        return tokens.length > 1 && tokens.every(t => name.includes(t)) ? 350 : 0;
    }

    function score(e, q, tokens) {
        if (!q) return 0;
        const name = e.n;
        // `a`: a second name (the editor's name for a record, a model's folder path), matched like the name.
        let best = Math.max(nameScore(name, q, tokens), e.a ? nameScore(e.a, q, tokens) : 0);
        if (e.i) {
            const bare = q.charAt(0) === '#' ? q.slice(1) : q;
            if (bare && e.i === bare) best = Math.max(best, 900);
            else if (bare && /^\d+$/.test(bare) && e.i.startsWith(bare)) best = Math.max(best, 200);
        }
        if (!best && e.c) {
            if (e.c.includes(q)) best = 150;
            else if (tokens.length > 1 && tokens.every(t => e.c.includes(t) || name.includes(t))) best = 100;
        }
        if (!best) return 0;
        // A shorter name is the closer match among equals.
        return best - Math.min(name.length, 99) / 100;
    }

    function prepareQuery(query) {
        const q = lower(query).trim().replace(/\s+/g, ' ');
        return { q, tokens: q ? q.split(' ') : [] };
    }

    /** Ranked matches of `query` among `entries`: [{ entry, score }], best first. */
    function search(entries, query, { limit = 200 } = {}) {
        const { q, tokens } = prepareQuery(query);
        const hits = [];
        if (!q) return hits;
        for (const e of entries) {
            const s = score(e, q, tokens);
            if (s > 0) hits.push({ entry: e, score: s });
        }
        hits.sort((a, b) => (b.score - a.score)
            || (groupRank(a.entry.group) - groupRank(b.entry.group)));
        return limit ? hits.slice(0, limit) : hits;
    }

    /** Results grouped, groups in the order of their best result, each capped at `perGroup`. */
    function groupResults(hits, perGroup = 8) {
        const groups = [];
        const byKey = new Map();
        for (const hit of hits) {
            let group = byKey.get(hit.entry.group);
            if (!group) { group = { key: hit.entry.group, label: hit.entry.groupLabel || '', hits: [], total: 0 }; byKey.set(group.key, group); groups.push(group); }
            group.total++;
            if (group.hits.length < perGroup) group.hits.push(hit);
        }
        return groups;
    }

    /**
     * The index: entries kept in named groups, each rebuilt from its builder
     * only when marked stale. `generation` counts rebuilds, so a narrowing
     * search knows when its previous matches are still the whole story.
     */
    class SearchIndex {
        constructor() {
            this.groups = new Map(); // key -> { build, entries, stale }
            this.generation = 0;
            this._all = null;
            this._last = null; // { q, generation, hits }
            this.lastBuildMs = 0;
            this.lastSearchMs = 0;
        }

        define(key, build) {
            const known = this.groups.get(key);
            if (known) { known.build = build; known.stale = true; }
            else this.groups.set(key, { build, entries: [], stale: true });
        }

        set(key, entries) {
            this.groups.set(key, { build: null, entries: entries || [], stale: false });
            this._changed();
        }

        remove(key) { if (this.groups.delete(key)) this._changed(); }

        invalidate(match) {
            for (const [key, group] of this.groups) {
                if (!group.build) continue;
                if (typeof match === 'function' ? match(key) : (match == null || key === match)) group.stale = true;
            }
        }

        refresh() {
            const started = now();
            let rebuilt = 0;
            for (const [key, group] of this.groups) {
                if (!group.stale || !group.build) continue;
                try { group.entries = group.build() || []; } catch (error) { group.entries = []; console.warn('Search index:', key, error); }
                group.stale = false;
                rebuilt++;
            }
            if (rebuilt) { this._changed(); this.lastBuildMs = now() - started; }
            return rebuilt;
        }

        _changed() { this.generation++; this._all = null; }

        entries() {
            if (!this._all) {
                this._all = [];
                for (const group of this.groups.values()) for (const e of group.entries) this._all.push(e);
            }
            return this._all;
        }

        search(query, options = {}) {
            const started = now();
            const { q } = prepareQuery(query);
            const last = this._last;
            // A longer query only narrows: search what the shorter one matched.
            const pool = last && last.generation === this.generation && last.q && q.startsWith(last.q)
                ? last.hits.map(hit => hit.entry) : this.entries();
            const hits = search(pool, query, { limit: 0 });
            this._last = { q, generation: this.generation, hits };
            this.lastSearchMs = now() - started;
            return options.limit ? hits.slice(0, options.limit) : hits;
        }

        get size() { return this.entries().length; }
    }

    function now() {
        return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    }

    const api = {
        DATABASE_TYPES, CONTINUATION_PARENT, GROUP_ORDER,
        commandStrings, commandTexts, snippet, databaseRecords, recordLabel, databaseEntries, modelEntries, mapEntries, mapEventEntries,
        systemEntries, pluginEntries, score, search, groupResults, SearchIndex
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window === 'undefined') return;
    root.RRGlobalSearchCore = api;

    // ---------------------------------------------------------------- the editor side

    const tt = text => (window.I18n && window.I18n.tText) ? window.I18n.tText(text) : text;
    // The palette's own strings (globalSearch.* in I18nManager.js), with English when a table lacks one.
    const ts = (key, params) => (window.I18n && window.I18n.t) ? window.I18n.t(`globalSearch.${key}`, params) : key;
    const esc = text => (typeof rrEscapeHtml === 'function') ? rrEscapeHtml(text)
        : String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

    const GROUP_LABELS = {
        editor: 'menuCommands', dbPages: 'dbPages', settings: 'settings', forge: 'forgeTools',
        db: 'database', maps: 'maps', mapEvents: 'mapEvents', mapEventCommands: 'eventContents',
        commonEventCommands: 'commonEventContents', switches: 'switches', variables: 'variables', plugins: 'plugins'
    };

    const SETTINGS = [
        ['options.title', null], ['options.appearance', null], ['options.language', null], ['options.palette', null],
        ['options.mode', null], ['options.editor', null], ['options.animateAutotiles', null], ['options.databaseListLabels', null]
    ];

    class GlobalSearch {
        constructor() {
            this.index = new SearchIndex();
            this.defined = false;
            this.overlay = null;
            this.active = 0;
            this.rows = [];
            this._timer = null;
            this._mapCache = new Map(); // mapId -> { mtime, entries }
            this._mapQueue = [];
            this._project = null;
            this._mapRef = null;
        }

        app() { return window.reactor || null; }
        pc() { return this.app() && this.app().projectController; }
        db() { const app = this.app(); return (app && app.databaseManager) || (this.pc() && this.pc().databaseManager) || null; }
        eventManager() { const app = this.app(); return (app && app.eventManager) || (this.pc() && this.pc().eventManager) || null; }
        project() { const pc = this.pc(); return pc && pc.getCurrentProject ? pc.getCurrentProject() : null; }

        install() {
            const button = document.getElementById('global-search-btn');
            const label = () => {
                if (!button) return;
                button.title = ts('button');
                button.setAttribute('aria-label', ts('title'));
            };
            label();
            window.addEventListener('rr-language-changed', label);
            if (button) button.addEventListener('click', event => { event.stopPropagation(); this.toggle(); });
            window.addEventListener('keydown', event => this._shortcut(event), true);
            // Editing anywhere outside the field may change a name or a line: the project's groups
            // are rebuilt the next time the field searches (nothing is computed now).
            const touched = event => {
                if (this.overlay && this.overlay.contains(event.target)) return;
                this.index.invalidate(key => key !== 'editor' && !key.startsWith('map:') && !key.startsWith('files:'));
                this._invalidateCurrentMap();
            };
            document.addEventListener('change', touched, true);
            document.addEventListener('input', touched, true);
            for (const name of ['rr-events-changed', 'rr-map-edited']) window.addEventListener(name, () => this._invalidateCurrentMap());
            window.addEventListener('rr-language-changed', () => {
                this.index.invalidate(key => key === 'editor' || key.startsWith('db:'));
                if (!this.isOpen()) this.overlay = null; // its field and hints are rebuilt in the new language
            });
        }

        _shortcut(event) {
            const mod = event.ctrlKey || event.metaKey;
            if (!mod || event.altKey) return;
            const key = String(event.key || '').toLowerCase();
            const wanted = (key === 'f' && event.shiftKey) || (key === 'p' && !event.shiftKey);
            if (!wanted) return;
            event.preventDefault();
            event.stopPropagation();
            if (this.isOpen()) this.input.select(); else this.open();
        }

        // ------------------------------------------------------------ the index

        _define() {
            const project = this.project();
            const projectKey = project && project.path || null;
            if (this.defined && this._project === projectKey) return;
            if (this._project !== projectKey) {
                for (const key of [...this.index.groups.keys()]) if (key !== 'editor') this.index.remove(key);
                this._mapCache.clear();
            }
            this._project = projectKey;
            this.defined = true;
            this.index.define('editor', () => this._editorEntries());
            if (!project) return;
            const editorNames = typeof RREditorNames !== 'undefined' ? RREditorNames : null;
            for (const [type, fallback] of DATABASE_TYPES) {
                this.index.define(`db:${type}`, () => {
                    const db = this.db();
                    const data = db && db.data;
                    // The stock vehicles are named in the editor's language, as their page lists them.
                    const records = databaseRecords(type, data).map(r => r && r.stockVehicle ? { ...r, name: tt(r.name) } : r);
                    const named = editorNames && data && data.editorNames ? id => editorNames.get(data.editorNames, type, id) : null;
                    return databaseEntries(type, records, this._dbTitle(type, fallback), named);
                });
            }
            // The 3D Models page lists the 3d/ folder: read again each time the field opens.
            this.index.define('files:reactor3d', () => {
                const current = this.project();
                const models = current && current.path && typeof ModelGraphicPicker !== 'undefined' ? ModelGraphicPicker.listModels(current.path) : [];
                return modelEntries(models, this._dbTitle('reactor3d', '3D Models'));
            });
            this.index.define('system', () => systemEntries(this.db() && this.db().getSystem && this.db().getSystem()));
            this.index.define('maps', () => mapEntries(this.db() && this.db().getMapInfos && this.db().getMapInfos()));
            this.index.define('plugins', () => pluginEntries(this._plugins()));
        }

        _dbTitle(type, fallback) {
            const ui = this.app() && this.app().databaseEditorUI;
            if (ui && ui._dbTitle) { try { return ui._dbTitle(type, fallback); } catch (_) { /* fall through */ } }
            return tt(fallback);
        }

        _plugins() {
            const pm = this.app() && this.app().pluginManager;
            if (pm && Array.isArray(pm.plugins) && pm.plugins.length) return pm.plugins;
            // Not loaded yet: read the project's plugin list the way the manager does.
            const project = this.project();
            if (!project || !project.path || typeof require !== 'function' || typeof PluginManager === 'undefined' || !PluginManager.parsePluginsManifest) return [];
            try {
                const fs = require('fs'), path = require('path');
                for (const file of ['reactor_plugins.js', 'plugins.js']) {
                    const full = path.join(project.path, 'js', file);
                    if (fs.existsSync(full)) {
                        const list = PluginManager.parsePluginsManifest(fs.readFileSync(full, 'utf8'));
                        if (list && list.length) return list;
                    }
                }
            } catch (_) { /* no plugins listed */ }
            return [];
        }

        _invalidateCurrentMap() {
            const map = this.eventManager() && this.eventManager().currentMap;
            if (map && map.id) this.index.invalidate(`map:${map.id}`);
        }

        /** Maps: the open one from memory (its unsaved edits included), the rest from their files, a few per frame. */
        _queueMaps() {
            const project = this.project();
            const infos = this.db() && this.db().getMapInfos && this.db().getMapInfos();
            if (!project || !Array.isArray(infos)) return;
            const current = this.eventManager() && this.eventManager().currentMap;
            if (current && current.id) {
                const info = infos[current.id];
                this.index.define(`map:${current.id}`, () => mapEventEntries(current.id, info && info.name, current));
                if (this._mapRef !== current) {
                    // Another map opened: the one left reads from its file again.
                    if (this._mapRef && this._mapRef.id) this._mapCache.delete(this._mapRef.id);
                    this._mapRef = current;
                }
            }
            this._mapQueue = infos.filter(info => info && info.id && !(current && info.id === current.id)).map(info => info.id);
            if (!this._mapTimer) this._mapTimer = setTimeout(() => this._readMaps(), 0);
        }

        _readMaps() {
            this._mapTimer = null;
            const project = this.project();
            if (!project || typeof require !== 'function') return;
            const fs = require('fs'), path = require('path');
            const infos = this.db().getMapInfos() || [];
            const started = now();
            let changed = false;
            while (this._mapQueue.length && now() - started < 12) {
                const id = this._mapQueue.shift();
                const file = path.join(project.path, 'data', `Map${String(id).padStart(3, '0')}.json`);
                try {
                    const mtime = fs.statSync(file).mtimeMs;
                    const cached = this._mapCache.get(id);
                    if (cached && cached.mtime === mtime) continue;
                    const map = JSON.parse(fs.readFileSync(file, 'utf8'));
                    this._mapCache.set(id, { mtime });
                    this.index.set(`map:${id}`, mapEventEntries(id, infos[id] && infos[id].name, map));
                    changed = true;
                } catch (_) { this._mapCache.set(id, { mtime: -1 }); }
            }
            if (this._mapQueue.length) this._mapTimer = setTimeout(() => this._readMaps(), 0);
            else this.indexReadyMs = now() - (this._openedAt || started);
            if (changed && this.isOpen() && this.input.value.trim()) this._run();
        }

        _editorEntries() {
            const out = [];
            const seen = new Set();
            const text = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
            document.querySelectorAll('#html-menu-bar .html-menu-item').forEach(menu => {
                const heading = text(menu.querySelector(':scope > span') || menu);
                menu.querySelectorAll('.html-menu-option[data-action], .html-menu-option[data-db]').forEach(option => {
                    const label = text(option.querySelector('span') || option);
                    const action = option.getAttribute('data-action') || `db:${option.getAttribute('data-db')}`;
                    if (!label || seen.has(action)) return;
                    seen.add(action);
                    const shortcut = option.querySelectorAll('span')[1];
                    out.push(entry('editor', label, { sub: heading + (shortcut ? ` · ${text(shortcut)}` : ''), target: { kind: 'element', element: option } }));
                });
            });
            document.querySelectorAll('#toolbar .tool-button[data-action]').forEach(button => {
                const action = button.getAttribute('data-action');
                const label = button.getAttribute('title') || button.getAttribute('aria-label');
                if (!label || seen.has(action)) return;
                seen.add(action);
                out.push(entry('editor', label, { sub: ts('toolbar'), target: { kind: 'element', element: button } }));
            });
            const sections = (typeof DatabaseEditorUI !== 'undefined' && DatabaseEditorUI.NAV_SECTIONS) || [];
            for (const section of sections) {
                for (const page of section.pages) {
                    out.push(entry('dbPages', this._dbTitle(page.type, page.name), {
                        sub: `${ts('database')} · ${tt(section.name)}`, target: { kind: 'databasePage', type: page.type }
                    }));
                }
            }
            const t = key => (window.I18n && window.I18n.t) ? window.I18n.t(key) : key;
            for (const [key] of SETTINGS) {
                const label = String(t(key)).replace(/[:：]\s*$/, '');
                if (!label || label === key) continue;
                out.push(entry('settings', label, { sub: t('options.title'), target: { kind: 'setting', label } }));
            }
            if (typeof FORGE_TOOLS !== 'undefined') {
                for (const tool of FORGE_TOOLS) {
                    out.push(entry('forge', t(tool.nameKey), {
                        c: lower(tool.descriptionKey ? t(tool.descriptionKey) : ''), sub: ts('forge'),
                        target: { kind: 'forge', id: tool.id }
                    }));
                }
            }
            return out;
        }

        // ------------------------------------------------------------ the palette

        isOpen() { return !!(this.overlay && this.overlay.isConnected); }
        toggle() { if (this.isOpen()) this.close(); else this.open(); }

        open() {
            if (!this.overlay) this._create();
            if (!this.overlay.isConnected) document.body.appendChild(this.overlay);
            this._openedAt = now();
            this._define();
            if (this.project()) this._queueMaps();
            this.index.invalidate(key => key.startsWith('files:'));
            this.index.refresh();
            this.indexMs = now() - this._openedAt;
            this.previousFocus = document.activeElement;
            this.input.focus();
            this.input.select();
            this._run();
        }

        close() {
            if (!this.isOpen()) return;
            this.overlay.remove();
            clearTimeout(this._timer);
        }

        _create() {
            const overlay = document.createElement('div');
            overlay.className = 'rr-global-search-overlay';
            overlay.setAttribute('data-rr-i18n-skip', '');
            overlay.innerHTML = `
                <div class="rr-global-search" role="dialog" aria-label="${esc(ts('title'))}">
                    <div class="rr-modal-header rr-global-search-head">
                        <div class="rr-modal-title">${esc(ts('title'))}</div>
                        <button class="rr-modal-close" type="button" aria-label="${esc(ts('title'))}">×</button>
                    </div>
                    <div class="rr-global-search-field">
                        ${GlobalSearch.ICON}
                        <input type="search" spellcheck="false" autocomplete="off" role="combobox" aria-expanded="true"
                            aria-controls="rr-global-search-results" placeholder="${esc(ts('placeholder'))}">
                    </div>
                    <div class="rr-global-search-results" id="rr-global-search-results" role="listbox"></div>
                    <div class="rr-modal-footer rr-global-search-hint">${esc(ts('hint'))}</div>
                </div>`;
            this.overlay = overlay;
            this.input = overlay.querySelector('input');
            this.results = overlay.querySelector('.rr-global-search-results');
            overlay.querySelector('.rr-modal-close').addEventListener('click', () => this.close());
            // Like every dialog here, it closes deliberately (Escape, or the toolbar button), never from a click beside it.
            this.input.addEventListener('input', () => {
                clearTimeout(this._timer);
                this._timer = setTimeout(() => this._run(), 60);
            });
            this.input.addEventListener('keydown', event => this._keys(event));
            this.results.addEventListener('mousemove', event => {
                const row = event.target.closest('.rr-global-search-row');
                if (row && Number(row.dataset.row) !== this.active) this._setActive(Number(row.dataset.row), false);
            });
            this.results.addEventListener('click', event => {
                const row = event.target.closest('.rr-global-search-row');
                if (row) this.go(this.rows[Number(row.dataset.row)]);
            });
        }

        _keys(event) {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                if (this.rows.length) this._setActive((this.active + (event.key === 'ArrowDown' ? 1 : -1) + this.rows.length) % this.rows.length, true);
            } else if (event.key === 'Enter') {
                event.preventDefault();
                clearTimeout(this._timer);
                if (this._pending) this._run();
                if (this.rows[this.active]) this.go(this.rows[this.active]);
            } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                if (this.input.value) { this.input.value = ''; this._run(); } else this.close();
            }
            this._pending = event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete';
        }

        _run() {
            this._pending = false;
            this.index.refresh();
            const query = this.input.value;
            const { q } = prepareQuery(query);
            this.rows = [];
            this.active = 0;
            if (!q) {
                this.results.innerHTML = `<div class="rr-global-search-empty">${esc(ts('empty'))}</div>`;
                return;
            }
            const groups = groupResults(this.index.search(query), 8);
            if (!groups.length) {
                this.results.innerHTML = `<div class="rr-global-search-empty">${esc(ts('noResults'))}</div>`;
                return;
            }
            const html = [];
            for (const group of groups) {
                // Each kind under the section header the rest of the editor uses, its count at the right.
                html.push(`<div class="rr-global-search-group lit-section-header"><span>${esc(group.label || (GROUP_LABELS[group.key] ? ts(GROUP_LABELS[group.key]) : group.key))}</span><span class="lit-section-meta rr-global-search-count">${group.total}</span></div>`);
                for (const hit of group.hits) {
                    const e = hit.entry;
                    const n = this.rows.push(e) - 1;
                    const content = e.raw ? `<span class="rr-global-search-text">${this._mark(snippet(e.raw, q), q)}</span>` : '';
                    const page = e.page ? ` · ${esc(ts('page', { number: e.page }))}` : '';
                    html.push(`<div class="rr-global-search-row" role="option" data-row="${n}">
                        <span class="rr-global-search-name">${this._mark(e.label || e.title, q)}</span>${content}
                        <span class="rr-global-search-sub">${esc(e.sub || '')}${page}</span></div>`);
                }
            }
            this.results.innerHTML = html.join('');
            this._setActive(0, true);
        }

        _mark(text, q) {
            const value = String(text || '');
            const at = value.toLowerCase().indexOf(q);
            if (!q || at < 0) return esc(value);
            return esc(value.slice(0, at)) + '<mark>' + esc(value.slice(at, at + q.length)) + '</mark>' + esc(value.slice(at + q.length));
        }

        _setActive(n, scroll) {
            this.active = n;
            this.results.querySelectorAll('.rr-global-search-row.active').forEach(row => { row.classList.remove('active'); row.removeAttribute('aria-selected'); });
            const row = this.results.querySelector(`.rr-global-search-row[data-row="${n}"]`);
            if (row) { row.classList.add('active'); row.setAttribute('aria-selected', 'true'); if (scroll) row.scrollIntoView({ block: 'nearest' }); }
        }

        // ------------------------------------------------------------ going there

        async go(e) {
            if (!e || !e.target) return;
            this.close();
            try { await GlobalSearch.navigate(this, e.target); } catch (error) { console.warn('Search: could not go to the result', error); }
        }

        /** Closes the Database window (asking about unsaved edits) before going somewhere it covers. */
        async leaveDatabase() {
            const viewer = document.getElementById('database-viewer');
            const ui = this.app() && this.app().databaseEditorUI;
            if (!viewer || !viewer.classList.contains('active') || !ui) return true;
            if (ui.askToCloseDatabase) await ui.askToCloseDatabase();
            else if (ui.closeDatabaseViewer) ui.closeDatabaseViewer();
            return !viewer.classList.contains('active');
        }

        async openMap(mapId) {
            const pc = this.pc();
            if (!pc || !pc.loadMap) return false;
            if (!await this.leaveDatabase()) return false;
            return pc.loadMap(mapId);
        }

        static flash(element) {
            if (!element) return;
            element.scrollIntoView({ block: 'center' });
            element.classList.add('rr-global-search-flash');
            setTimeout(() => element.classList.remove('rr-global-search-flash'), 1600);
        }

        /**
         * Scrolls to and flashes the row `find` returns once it is laid out. A window that is
         * still opening (the event editor's, the Database's) has no layout yet, and moving its
         * panel into its own window or rendering the list again drops the scroll: for a moment
         * after, the row is brought back into view whenever it has left it.
         */
        static async reveal(find) {
            const laidOut = () => { const el = find(); return el && el.getBoundingClientRect && el.getBoundingClientRect().height > 0 ? el : null; };
            const first = await GlobalSearch.until(laidOut, 2500);
            if (!first) return null;
            GlobalSearch.flash(first);
            let last = first;
            for (let i = 0; i < 8; i++) {
                await wait(150);
                const el = laidOut();
                if (!el) continue;
                if (el !== last) { GlobalSearch.flash(el); last = el; continue; }
                if (!GlobalSearch.inView(el)) el.scrollIntoView({ block: 'center' });
            }
            return last;
        }

        /** Whether an element shows inside every scrolling box around it. */
        static inView(el) {
            const rect = el.getBoundingClientRect();
            for (let box = el.parentElement; box; box = box.parentElement) {
                if (box.scrollHeight <= box.clientHeight) continue;
                const outer = box.getBoundingClientRect();
                if (rect.bottom <= outer.top || rect.top >= outer.bottom) return false;
            }
            return true;
        }

        static async until(test, timeout = 1500) {
            const end = Date.now() + timeout;
            let value = test();
            while (!value && Date.now() < end) { await wait(40); value = test(); }
            return value;
        }
    }

    /**
     * Where each kind of result goes. Kept apart so the tests can drive it with
     * stand-ins for the editor's managers.
     */
    GlobalSearch.navigate = async function navigate(search, target) {
        const app = search.app();
        switch (target.kind) {
            case 'database':
            case 'databasePage':
                app.openDatabase(target.type, target.id ? { select: target.id } : undefined);
                return true;
            case 'model': {
                // The 3D Models page opens on the model it last showed: name it first, then open the page.
                const ui = app.databaseEditorUI;
                if (ui && ui.reactor3dEditor) ui.reactor3dEditor.selectedName = target.name;
                app.openDatabase('reactor3d');
                const models = app.databaseEditorUI && app.databaseEditorUI.reactor3dEditor;
                if (!models) return false;
                await GlobalSearch.until(() => models._detail && models._detail.querySelector('.r3d-model-list .database-list-item'));
                if (models.selectedName !== target.name && models.listModels && models.selectModel) {
                    const entry = models.listModels().find(m => m.name === target.name);
                    if (entry) await models.selectModel(entry);
                }
                await GlobalSearch.reveal(() => document.querySelector(`.r3d-model-list [data-model="${String(target.name).replace(/["\\]/g, '\\$&')}"]`));
                return models.selectedName === target.name;
            }
            case 'commonEvent': {
                app.openDatabase('commonEvents', { select: target.id });
                const editor = app.databaseEditorUI && app.databaseEditorUI.commonEventEditor;
                const list = await GlobalSearch.until(() => {
                    const el = document.getElementById('common-event-command-list');
                    return el && el.querySelector('[data-cmd-index]') && editor && editor.currentEvent && editor.currentEvent.id === target.id ? el : null;
                });
                if (!list || target.command == null) return !!list;
                editor.selectedCommandIndices = [target.command];
                editor.renderCommandList(list, editor.currentEvent);
                list.focus({ preventScroll: true });
                await GlobalSearch.reveal(() => document.querySelector(`#common-event-command-list [data-cmd-index="${target.command}"]`));
                return true;
            }
            case 'map':
                return search.openMap(target.mapId);
            case 'mapEvent': {
                if (!await search.openMap(target.mapId)) return false;
                const em = search.eventManager();
                if (!em) return false;
                em.selectEventFromList(target.eventId);
                if (target.command == null) return true;
                const event = em.currentMap && em.currentMap.events.find(ev => ev && ev.id === target.eventId);
                if (!event) return false;
                em.editEvent(event);
                const editor = await GlobalSearch.until(() => em.eventEditor && em.eventEditor.isOpen && em.eventEditor.isOpen() && em.eventEditor.sourceEvent === event ? em.eventEditor : null);
                if (!editor) return false;
                if (target.page != null && editor.currentPageIndex !== target.page) editor.switchToPage(target.page);
                editor.commandList.selectSingle(target.command);
                editor.renderCurrentPage();
                // The editor's own window is searched too (PopoutBridge widens document.querySelector to it).
                await GlobalSearch.reveal(() => document.querySelector(`.command-list-container .command-item[data-index="${target.command}"]`));
                return true;
            }
            case 'switch':
            case 'variable': {
                if (typeof SwitchVariablePicker === 'undefined') return false;
                const picker = new SwitchVariablePicker(search.db(), search.pc());
                picker.show(target.kind, target.id, () => {});
                return true;
            }
            case 'plugin': {
                if (!app.showPluginManager) return false;
                app.showPluginManager();
                const pm = app.pluginManager;
                const index = await GlobalSearch.until(() => {
                    const at = pm && Array.isArray(pm.plugins) ? pm.plugins.findIndex(p => p && p.name === target.name) : -1;
                    return at >= 0 ? at + 1 : 0;
                });
                if (!index) return false;
                pm.selectPluginFromEvent(index - 1);
                return true;
            }
            case 'element':
                if (target.element && target.element.isConnected) target.element.click();
                return true;
            case 'setting': {
                if (!app.optionsManager) return false;
                app.optionsManager.show();
                const label = await GlobalSearch.until(() => {
                    const labels = document.querySelectorAll('.rr-modal label, .rr-modal h3, .rr-modal h4, .rr-modal .rr-opt-section-title');
                    return [...labels].find(el => (el.textContent || '').includes(target.label)) || null;
                }, 800);
                if (label) await GlobalSearch.reveal(() => label.isConnected ? label : null);
                return true;
            }
            case 'forge':
                if (!app.forgeManager) return false;
                app.forgeManager.openTool(target.id);
                return true;
            default:
                return false;
        }
    };

    // The toolbar's scanner lens, the same picture as its button (index.html #global-search-btn), its own gradient ids.
    GlobalSearch.ICON = `<svg class="rr-global-search-icon" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <defs>
        <linearGradient id="rr-gs-gold" x1="5" y1="15" x2="51" y2="58" gradientUnits="userSpaceOnUse"><stop stop-color="#fff3a0"/><stop offset=".3" stop-color="#ffd529"/><stop offset=".72" stop-color="#f08a0c"/><stop offset="1" stop-color="#a94d08"/></linearGradient>
        <radialGradient id="rr-gs-glass" cx="22" cy="22" r="20" gradientUnits="userSpaceOnUse"><stop stop-color="#e9fdff"/><stop offset=".35" stop-color="#5fe0ff"/><stop offset=".8" stop-color="#1563d6"/><stop offset="1" stop-color="#0a2a7a"/></radialGradient>
        <radialGradient id="rr-gs-spark"><stop stop-color="#fff"/><stop offset=".28" stop-color="#fffbd5"/><stop offset=".62" stop-color="#ffd529"/><stop offset="1" stop-color="#d7318f"/></radialGradient>
        </defs>
        <path d="M37 40l5-5 17 15c1.5 1.4 1.5 3.6 0 5l-1 1c-1.4 1.5-3.6 1.5-5 0z" fill="url(#rr-gs-gold)" stroke="#010718" stroke-width="4" stroke-linejoin="round"/>
        <path d="M47 45l5 5" stroke="#072b95" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="24" cy="24" r="18" fill="url(#rr-gs-glass)" stroke="#010718" stroke-width="4.5"/>
        <circle cx="24" cy="24" r="13" fill="none" stroke="#ffd529" stroke-width="3" stroke-dasharray="15.4 5" transform="rotate(-38 24 24)"/>
        <path d="M24 17v3M24 28v3M17 24h3M28 24h3" stroke="#e9fdff" stroke-width="2" stroke-linecap="round"/>
        <path d="M14 18a11 11 0 0 1 6-6" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none"/>
        <path d="M52 2c1.2 4.3 3 6.4 7 7.4-4 1-5.8 3.1-7 7.4-1.2-4.3-3-6.4-7-7.4 4-1 5.8-3.1 7-7.4z" fill="url(#rr-gs-spark)" stroke="#d7318f" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>`;

    root.RRGlobalSearch = GlobalSearch;
    const start = () => {
        if (root.rrGlobalSearch) return;
        root.rrGlobalSearch = new GlobalSearch();
        root.rrGlobalSearch.install();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})(typeof window !== 'undefined' ? window : globalThis);
