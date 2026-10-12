/**
 * Folding sections of the Database.
 *
 * Every card of a Database page folds to its header and stays as the user
 * left it: per project, per page and per section, the same for every record
 * of that page. The folds are kept in one small per-user file outside the
 * editor profile and outside the project (localStorage in the web edition),
 * so they outlive an editor update and never change a project.
 *
 *   names     slug(), titleOf(), keyOf(): a section is named by the
 *             `data-section-key` its page gives it, else by the English
 *             source of its title; never by a translation
 *   memory    createStore(): get / set, safe with a damaged file and with
 *             two editor windows; recall() / remember() on the shared store
 *   selection recallSelection() / rememberSelection(): the record last
 *             selected on each list page, kept the same way in a file of
 *             its own
 *   default   battleModes(), battleCardFolded(), createBattleScan(): a
 *             battle card starts folded in a project that never fights its
 *             way (Tactical; Action and First Person), and open for a record
 *             that already sets something in it
 *   layout    soloRows(): a folded card is a bar across its row
 *   behavior  attach(): the click, the keys, aria and the classes of every
 *             section under one host element
 *
 * A page that writes a title through the label manager (`tt('Parameters')`)
 * names the card on its header: `data-section-key="parameters"`. A rendered
 * title cannot be read back to its English source: two English strings of
 * one page often share a translation ("Parameters" and "Parameter").
 *
 * A page opts a panel that is not a `.database-section` in with the classes
 * `rr-db-fold` (the panel) and `rr-db-fold-header` (its title line), and
 * opts a card out with `data-section-fold="off"`. A section that draws
 * itself listens for `rr-section-fold` on its card (`detail.collapsed`).
 */
(function(root) {
    'use strict';

    const SECTIONS = '.database-section, .rr-db-fold';
    const HEADERS = '.database-section-header, .rr-db-fold-header';
    const HEADER_CLASSES = ['database-section-header', 'rr-db-fold-header'];
    // A click that lands on one of these inside a header is for the control, not for the fold.
    const CONTROLS = 'button, input, select, textarea, a, label, option, [contenteditable="true"], [role="tab"], .rr-number-stepper, .rr-number-stepper-auto, .rr-shim-wrapper';
    // The panes of a workspace page stand around its canvas at fixed sizes: a folded pane would leave its column empty.
    const WORKSPACES = ['rr-ui-workspace', 'rr-battle-workspace'];
    // Cards in these grids stretch to the height of their row, so a row with a folded card is laid out again.
    const STRETCH_GRIDS = '.database-sections-grid, .database-actor-pair';
    const COLLAPSED = 'is-collapsed';
    const SOLO = 'rr-section-solo';
    const FOLD_EVENT = 'rr-section-fold';
    // Keys a folded card's title leaves to the dialog and the window: moving on, closing, the function keys.
    const PASS_KEYS = /^(?:Tab|Escape|F\d{1,2})$/;

    const FILE_NAME = 'database-sections.json';
    const STORAGE_KEY = 'rr-database-sections';
    const SELECTION_FILE_NAME = 'database-selection.json';
    const SELECTION_STORAGE_KEY = 'rr-database-selection';
    const STATE_DIR_ENV = 'RPG_REACTOR_EDITOR_STATE_DIR';

    //-------------------------------------------------------------------------
    // Names.

    /** A title as a key: lower case, words joined by dashes. */
    function slug(text) {
        const source = String(text == null ? '' : text).trim();
        return source.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || source;
    }

    const isElement = node => !!(node && node.tagName);
    const tidy = value => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    const hasClass = (element, name) => !!(element && element.classList && element.classList.contains(name));

    /** The words of a header that name its section: its own text, or its first part that is not a control. */
    function titleOf(header) {
        if (!header) return '';
        const stamped = header.getAttribute('data-i18n-text-source');
        if (stamped) return tidy(stamped);
        for (const node of header.childNodes || []) {
            if (!isElement(node)) {
                const words = tidy(node.nodeValue);
                if (words) return words;
                continue;
            }
            if (node.closest(CONTROLS) === node) continue;
            const words = tidy(node.getAttribute('data-i18n-text-source') || node.textContent);
            if (words) return words;
        }
        return '';
    }

    // What each translated label came from, by language. The label manager's own map loses a label once
    // its label pass has read the translated text back (the label then names itself as its source).
    const sources = new Map();

    /** The English text (or the string key) a rendered label came from; the label itself when it was never translated. */
    function sourceOf(text, i18n) {
        const served = i18n && i18n._served;
        const found = served && typeof served.get === 'function' ? served.get(text) : null;
        const source = found ? (found.text || found.key || text) : text;
        const name = String((i18n && i18n.language) || '') + '\n' + text;
        if (source !== text) { sources.set(name, source); return source; }
        return sources.has(name) ? sources.get(name) : text;
    }

    /**
     * The name a section is remembered by, the same in every language: the
     * key on the card or on its header; for a card without one, the English
     * source of its title as far as the label manager can still tell it.
     */
    function keyOf(section, header, i18n) {
        const own = (section && section.getAttribute('data-section-key')) || (header && header.getAttribute('data-section-key'));
        return own ? String(own) : slug(sourceOf(titleOf(header), i18n));
    }

    //-------------------------------------------------------------------------
    // Memory.

    const empty = () => ({ version: 1, projects: {} });
    const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
    const isFold = value => typeof value === 'boolean';
    const isRecordId = value => Number.isInteger(value);

    /** What a file or a storage entry holds, as far as it is well formed (`accept` says which values are); an empty memory otherwise. */
    function parse(text, accept = isFold) {
        let raw;
        try { raw = JSON.parse(text); } catch (error) { return empty(); }
        const out = empty();
        if (!plain(raw) || !plain(raw.projects)) return out;
        for (const [project, pages] of Object.entries(raw.projects)) {
            if (!plain(pages)) continue;
            const kept = {};
            for (const [page, sections] of Object.entries(pages)) {
                if (!plain(sections)) continue;
                const folds = {};
                for (const [key, collapsed] of Object.entries(sections)) if (accept(collapsed)) folds[key] = collapsed;
                if (Object.keys(folds).length) kept[page] = folds;
            }
            if (Object.keys(kept).length) out.projects[project] = kept;
        }
        return out;
    }

    /** The per-user folder for editor state that outlives an editor update: beside the playtest profiles, outside the editor's own. */
    function stateFolder(env, platform, home, pathMod) {
        if (env && env[STATE_DIR_ENV]) return String(env[STATE_DIR_ENV]);
        const base = platform === 'win32' ? (env.LOCALAPPDATA || env.APPDATA || pathMod.join(home, 'AppData', 'Local'))
            : platform === 'darwin' ? pathMod.join(home, 'Library', 'Application Support')
            : (env.XDG_CONFIG_HOME || pathMod.join(home, '.config'));
        return pathMod.join(base, 'RPGReactor', 'EditorState');
    }

    /** Node's file modules where the editor runs on a desktop; null in the web edition, which has no disk of the user's. */
    function nodeModules() {
        if (typeof process === 'undefined' || !process.versions || !process.versions.node || typeof require !== 'function') return null;
        if (root.RPGReactorWebHost && root.RPGReactorHost === root.RPGReactorWebHost) return null;
        try { return { fs: require('fs'), path: require('path'), os: require('os') }; } catch (error) { return null; }
    }

    /**
     * The folds of every project, in a file (desktop) or in localStorage (web).
     *
     * A read looks at the file again only when its time or size changed, so a
     * second editor window's folds arrive on the next page. A write reads the
     * file first and replaces it whole through a rename, so two windows never
     * leave half a file and neither drops the other's folds. A file that
     * cannot be read counts as empty and is rewritten by the next fold; a
     * folder that cannot be written keeps the folds for this session only.
     *
     * options: fs, path, os, env, platform (desktop), storage (web), warn;
     * fileName, storageKey and accept(value) for a memory of something other
     * than folds
     */
    function createStore(options = {}) {
        const fileName = options.fileName || FILE_NAME, storageKey = options.storageKey || STORAGE_KEY;
        const accept = options.accept || isFold, read = text => parse(text, accept);
        const node = options.storage ? null : (options.fs ? { fs: options.fs, path: options.path, os: options.os } : nodeModules());
        const env = options.env || (typeof process !== 'undefined' && process.env) || {};
        const platform = options.platform || (typeof process !== 'undefined' && process.platform) || '';
        const warn = options.warn || (message => { if (typeof console !== 'undefined' && console.warn) console.warn(message); });
        let storage = options.storage || null;
        if (!node && !storage) { try { storage = root.localStorage || null; } catch (error) { storage = null; } }
        const file = node ? node.path.join(stateFolder(env, platform, node.os && node.os.homedir ? node.os.homedir() : '', node.path), fileName) : null;
        let cache = empty(), stamp = '', warned = false, loaded = false;
        const canonical = new Map();

        /** A project's entry name: its real folder, the same however the path was typed. */
        function projectKey(projectPath) {
            const raw = String(projectPath == null ? '' : projectPath);
            if (!node || !raw) return raw;
            if (canonical.has(raw)) return canonical.get(raw);
            let resolved = node.path.resolve(raw);
            try { resolved = node.fs.realpathSync(resolved); } catch (error) { /* not on disk: the typed path names it */ }
            if (platform === 'win32') resolved = resolved.toLowerCase();
            canonical.set(raw, resolved);
            return resolved;
        }

        function load() {
            loaded = true;
            if (!node) {
                if (storage) { try { cache = read(storage.getItem(storageKey)); } catch (error) { /* blocked storage: this session only */ } }
                return cache;
            }
            try {
                const stat = node.fs.statSync(file), now = stat.mtimeMs + ':' + stat.size;
                if (now !== stamp) {
                    cache = read(node.fs.readFileSync(file, 'utf8'));
                    stamp = now;
                }
            } catch (error) {
                // No file yet, or one that cannot be opened: what this window holds stays.
            }
            return cache;
        }

        function save() {
            const text = JSON.stringify(cache, null, 1) + '\n';
            try {
                if (!node) {
                    if (storage) storage.setItem(storageKey, text);
                    return true;
                }
                const fs = node.fs;
                fs.mkdirSync(node.path.dirname(file), { recursive: true });
                const temp = `${file}.${typeof process !== 'undefined' ? process.pid : 0}.${Date.now().toString(36)}.tmp`;
                fs.writeFileSync(temp, text);
                try {
                    fs.renameSync(temp, file);
                } catch (error) {
                    // Windows refuses a rename over a file another program holds for a moment: write it in place instead.
                    try { fs.writeFileSync(file, text); } finally { try { fs.unlinkSync(temp); } catch (gone) { /* nothing left */ } }
                }
                const stat = fs.statSync(file);
                stamp = stat.mtimeMs + ':' + stat.size;
                return true;
            } catch (error) {
                if (!warned) { warned = true; warn(fileName + ' is kept for this session only: ' + (error && error.message || error)); }
                return false;
            }
        }

        return {
            file,
            projectKey,
            /** Look at the file again if another window changed it. */
            sync() { load(); },
            /** true folded, false unfolded, undefined never touched. */
            get(projectPath, page, key) {
                if (!loaded) load();
                const pages = cache.projects[projectKey(projectPath)];
                const value = pages && pages[page] ? pages[page][key] : undefined;
                return accept(value) ? value : undefined;
            },
            /** The folds of one page of one project, by section. */
            page(projectPath, page) {
                const pages = load().projects[projectKey(projectPath)];
                return Object.assign({}, pages && pages[page]);
            },
            set(projectPath, page, key, collapsed) {
                if (!page || !key) return false;
                load();
                const project = projectKey(projectPath);
                const pages = cache.projects[project] || (cache.projects[project] = {});
                const folds = pages[page] || (pages[page] = {});
                if (options.accept) {
                    if (!accept(collapsed)) return false;
                    if (folds[key] === collapsed) return true;
                    folds[key] = collapsed;
                } else folds[key] = !!collapsed;
                return save();
            }
        };
    }

    let sharedStore = null;
    /** The one store the editor's pages share. */
    function shared() { return sharedStore || (sharedStore = createStore()); }
    /** How a section of a page was left in this project: true folded, false unfolded, undefined never touched. */
    function recall(projectPath, page, key) { const store = shared(); store.sync(); return store.get(projectPath, page, key); }
    /** Keep a fold the user made. */
    function remember(projectPath, page, key, collapsed) { return shared().set(projectPath, page, key, collapsed); }

    /** A store of the record last selected on each list page (`id` of a page), per project. */
    function createSelectionStore(options = {}) {
        return createStore(Object.assign({}, options, { fileName: SELECTION_FILE_NAME, storageKey: SELECTION_STORAGE_KEY, accept: isRecordId }));
    }
    let sharedSelections = null;
    function selections() { return sharedSelections || (sharedSelections = createSelectionStore()); }
    /** The id of the record last selected on a list page of this project; undefined where none was. */
    function recallSelection(projectPath, page) { const store = selections(); store.sync(); return store.get(projectPath, page, 'id'); }
    /** Keep the record selected on a list page. */
    function rememberSelection(projectPath, page, id) { return selections().set(projectPath, page, 'id', id); }

    //-------------------------------------------------------------------------
    // The battle cards' default: folded while no battle of the project is fought their way.

    const MAP_MODES = ['tactical', 'action', 'firstPerson'];
    const NOTE_MODE = /<battle\s*mode\s*:\s*(\w+)\s*>/i;
    // The two ways of fighting on the map a Database card can be for. Action and First Person share
    // their settings, so they count as one.
    const TACTICAL = 1, ACTION = 2, EVERY_WAY = TACTICAL | ACTION;
    const wayOf = mode => (mode === 'tactical' ? TACTICAL : mode === 'action' || mode === 'firstPerson' ? ACTION : 0);
    const noteWays = note => {
        const tag = NOTE_MODE.exec(String(note == null ? '' : note));
        if (!tag) return 0;
        const mode = tag[1].toLowerCase();
        return wayOf(mode === 'firstperson' ? 'firstPerson' : mode);
    };

    /**
     * The ways of fighting on the map a list of event commands names: Start
     * Battle on Map or Change Battle Mode with a mode. A start command that
     * names none fights in the mode in force, which is Classic unless the
     * game, the troop or the map says otherwise.
     */
    function commandWays(list) {
        let ways = 0;
        for (const command of list || []) {
            if (!command || command.code !== 357) continue;
            const parameters = command.parameters || [];
            if (parameters[0] !== 'RPGReactor') continue;
            if (parameters[1] === 'StartMapBattle' || parameters[1] === 'ChangeBattleMode') ways |= wayOf(parameters[3] && parameters[3].mode);
            if (ways === EVERY_WAY) break;
        }
        return ways;
    }

    /** Whether a list of event commands names an on-map mode. */
    function commandsUseMapBattle(list) { return commandWays(list) > 0; }

    const COMMAND_MODE_TEXT = /"(?:StartMapBattle|ChangeBattleMode)"[^\]]{0,400}?"mode"\s*:\s*"(tactical|action|firstPerson)"/g;
    const SIDECAR_MODE_TEXT = /"battle"\s*:\s*\{[^{}]*"mode"\s*:\s*"(tactical|action|firstPerson)"/g;

    /** The same question asked of a map file's text (the map or its 3D sidecar), without parsing it. */
    function textWays(text) {
        const source = String(text == null ? '' : text);
        if (source.indexOf('attle') < 0) return 0;
        let ways = noteWays(source);
        for (const pattern of [COMMAND_MODE_TEXT, SIDECAR_MODE_TEXT]) {
            pattern.lastIndex = 0;
            for (let match; ways !== EVERY_WAY && (match = pattern.exec(source));) ways |= wayOf(match[1]);
        }
        return ways;
    }

    const said = ways => ({ tactical: !!(ways & TACTICAL), action: !!(ways & ACTION) });
    const heard = modes => (modes && typeof modes === 'object' ? (modes.tactical ? TACTICAL : 0) | (modes.action ? ACTION : 0) : 0);

    /** Whether a map file's text names an on-map mode. */
    function textUsesMapBattle(text) { return textWays(text) > 0; }

    /** Which battles on the map a map file's text names: `{ tactical, action }`, `action` for Action and First Person alike. */
    function textBattleModes(text) { return said(textWays(text)); }

    function factWays(facts) {
        const system = facts.system;
        let ways = wayOf(system && system.reactorBattle && system.reactorBattle.mode);
        for (const troop of facts.troops || []) {
            if (ways === EVERY_WAY) return ways;
            if (!troop) continue;
            ways |= wayOf(troop.reactorBattle && troop.reactorBattle.mode);
            for (const page of troop.pages || []) if (page) ways |= commandWays(page.list);
        }
        for (const event of facts.commonEvents || []) {
            if (ways === EVERY_WAY) return ways;
            if (event) ways |= commandWays(event.list);
        }
        const map = facts.openMap;
        if (map) {
            ways |= wayOf(map.reactor3d && map.reactor3d.battle && map.reactor3d.battle.mode) | noteWays(map.note);
            for (const event of map.events || []) {
                if (ways === EVERY_WAY) return ways;
                for (const page of (event && event.pages) || []) if (page) ways |= commandWays(page.list);
            }
        }
        return ways | heard(facts.maps);
    }

    /**
     * Which battles on the map the project fights anywhere: `{ tactical,
     * action }`, `action` for Action and First Person alike. A way counts
     * when its mode is named by the game, a troop, a map (its sidecar or a
     * note tag) or a command of a troop, a common event or a map event. A
     * start that names no mode (a start command without one, a map's
     * `<battle trigger>`, placed enemies) fights in the mode in force there,
     * the map's or else the game's, which is counted where it is named; in
     * a Classic project it counts for nothing. `maps` is what the scan of
     * the map files found (`{ tactical, action }`).
     */
    function battleModes(facts = {}) { return said(factWays(facts)); }

    /** Whether any battle of the project is fought on the map (`maps: true`: a map file says so). */
    function usesMapBattles(facts = {}) { return factWays(facts) > 0 || facts.maps === true; }

    // What a card's `data-section-default` asks for.
    const BATTLE_DEFAULTS = { 'tactical-battles': TACTICAL, 'action-battles': ACTION, 'map-battles': EVERY_WAY };

    /**
     * Whether a battle card nobody folded or opened by hand starts folded;
     * undefined for a card that is not a battle card.
     *
     * A card says which battles it is for with `data-section-default`:
     * "tactical-battles", "action-battles" (Action and First Person) or
     * "map-battles" (any of them; also the card with the key "tactics" that
     * says nothing). It starts open when the project fights that way, and
     * for a record that already sets something in it, which the card says
     * with `data-section-in-use="true"`. `modes` is battleModes()'s answer,
     * or a function that gives it (asked only for a battle card).
     */
    function battleCardFolded(key, section, modes) {
        const attribute = name => (section && typeof section.getAttribute === 'function' ? section.getAttribute(name) : null);
        const wanted = BATTLE_DEFAULTS[attribute('data-section-default')] || (key === 'tactics' ? EVERY_WAY : 0);
        if (!wanted) return undefined;
        if (attribute('data-section-in-use') === 'true') return false;
        return !(heard(typeof modes === 'function' ? modes() : modes) & wanted);
    }

    /**
     * Reads the project's map files for an on-map battle, off the page's
     * critical path: one file at a time, each read again only when it changed.
     *
     * options: fs (with promises), path
     */
    function createBattleScan(options = {}) {
        const node = options.fs ? { fs: options.fs, path: options.path } : nodeModules();
        const files = new Map();      // file -> { stamp, ways }
        const known = new Map();      // data folder -> the ways its maps fight
        const running = new Map();    // data folder -> Promise
        const MAP_FILE = /^Map\d+(?:\.r3d)?\.json$/i;

        async function read(folder) {
            const io = node.fs.promises;
            let names = [];
            try { names = await io.readdir(folder); } catch (error) { return 0; }
            let ways = 0;
            for (const name of names) {
                if (!MAP_FILE.test(name)) continue;
                const file = node.path.join(folder, name);
                try {
                    const stat = await io.stat(file), stamp = stat.mtimeMs + ':' + stat.size;
                    let entry = files.get(file);
                    if (!entry || entry.stamp !== stamp) {
                        entry = { stamp, ways: textWays(await io.readFile(file, 'utf8')) };
                        files.set(file, entry);
                    }
                    ways |= entry.ways;
                    // Nothing a later file says can add to both.
                    if (ways === EVERY_WAY) break;
                } catch (error) { /* a file that went away says nothing */ }
            }
            return ways;
        }

        const uses = folder => { const ways = known.get(String(folder)); return ways === undefined ? undefined : ways > 0; };
        return {
            /** Whether the last scan of this data folder found a battle on the map; undefined before the first one ends. */
            uses,
            /** Which battles on the map the last scan found (`{ tactical, action }`); undefined before the first one ends. */
            modes(folder) { const ways = known.get(String(folder)); return ways === undefined ? undefined : said(ways); },
            /** Scan the folder's maps; resolves with whether one of them fights on the map. */
            run(folder) {
                const key = String(folder);
                if (!node || !node.fs || !node.fs.promises || !key) return Promise.resolve(uses(key));
                if (running.has(key)) return running.get(key);
                const work = read(key).then(ways => { known.set(key, ways); running.delete(key); return ways > 0; },
                    () => { running.delete(key); return uses(key); });
                running.set(key, work);
                return work;
            }
        };
    }

    //-------------------------------------------------------------------------
    // Layout.

    /**
     * Which cards of a stretch grid take a whole row. Cards fill rows of
     * `columns` in order (a card that already spans the grid is a row of its
     * own); in a row with a folded card every card takes a row, so the folded
     * one is a bar and the one beside it has the width.
     *
     * items: [{ collapsed, full }] in document order. Returns a flag per item.
     */
    function soloRows(items, columns) {
        const solo = items.map(() => false);
        if (!(columns > 1)) return solo;
        let row = [];
        const close = () => {
            if (row.some(index => items[index].collapsed)) for (const index of row) solo[index] = true;
            row = [];
        };
        items.forEach((item, index) => {
            if (item.full) { close(); return; }
            row.push(index);
            if (row.length >= columns) close();
        });
        close();
        return solo;
    }

    //-------------------------------------------------------------------------
    // Behavior.

    /** The title line of a section: a direct child, or (an opted-in panel) the first one inside that belongs to it. */
    function headerOf(section) {
        for (const child of section.children || []) if (HEADER_CLASSES.some(name => hasClass(child, name))) return child;
        if (!hasClass(section, 'rr-db-fold')) return null;
        for (const header of section.querySelectorAll('.rr-db-fold-header')) if (header.closest(SECTIONS) === section) return header;
        return null;
    }

    function sectionOf(header) {
        const section = header && header.closest ? header.closest(SECTIONS) : null;
        return section && headerOf(section) === header ? section : null;
    }

    function foldable(section) {
        if (section.getAttribute('data-section-fold') === 'off') return false;
        const parent = section.parentElement;
        return !(parent && WORKSPACES.some(name => hasClass(parent, name)));
    }

    /**
     * Makes every section under `host` fold from its header and keeps it as
     * the user left it. One set of listeners on the host serves every page
     * the host is filled with.
     *
     * options:
     *   page()                    the Database page shown (a nav type such as "armors")
     *   project()                 the open project's folder
     *   store                     where folds are kept (the shared store by default)
     *   defaults(page, key, el)   true / false for a section never touched; undefined leaves it as the page drew it
     *   i18n                      the label manager, for the English source of a translated title
     *   view                      window-like, for getComputedStyle and observers (the global by default)
     */
    function attach(host, options = {}) {
        const store = options.store || shared();
        const view = options.view || root;
        const entries = new WeakMap();   // section -> { key, page, collapsed }
        const page = () => String((options.page && options.page()) || '');
        const project = () => (options.project && options.project()) || '';
        const i18n = () => options.i18n || root.I18n || null;

        function mark(section, header, entry, collapsed, announce) {
            const changed = entry.collapsed !== collapsed;
            entry.collapsed = collapsed;
            section.classList.toggle(COLLAPSED, collapsed);
            if (section.tagName === 'DETAILS' && section.open !== !collapsed) section.open = !collapsed;
            // A list card takes focus for its own shortcuts. Folded, only its title is a Tab stop; the card
            // still takes a click's focus, so a key pressed then stays in the detail pane.
            if (collapsed && section.getAttribute('tabindex') === '0') {
                entry.tabStop = true;
                section.setAttribute('tabindex', '-1');
            } else if (!collapsed && entry.tabStop) {
                entry.tabStop = false;
                section.setAttribute('tabindex', '0');
            }
            if (header) {
                header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                if (header.tagName !== 'SUMMARY') {
                    if (header.getAttribute('role') === null) header.setAttribute('role', 'button');
                    if (header.getAttribute('tabindex') === null) header.setAttribute('tabindex', '0');
                }
            }
            if (changed && announce && typeof view.CustomEvent === 'function') {
                section.dispatchEvent(new view.CustomEvent(FOLD_EVENT, { bubbles: true, detail: { collapsed, key: entry.name || entry.key, page: entry.page } }));
            }
        }

        /** Rows of a stretch grid that hold a folded card are laid out one card to a row. */
        function layout() {
            if (typeof view.getComputedStyle !== 'function') return;
            for (const grid of host.querySelectorAll(STRETCH_GRIDS)) {
                const cards = Array.from(grid.children || []).filter(card => !card.hidden);
                // A grid that is laid out reports its tracks in pixels; one that is not shown has no rows to speak of.
                const tracks = String(view.getComputedStyle(grid).gridTemplateColumns || '').split(/\s+/).filter(track => /^[\d.]+px$/.test(track));
                const items = cards.map(card => ({
                    collapsed: hasClass(card, COLLAPSED),
                    full: hasClass(card, 'full-width') || /-1|span/.test(String(card.style && card.style.gridColumn || ''))
                }));
                const solo = soloRows(items, tracks.length);
                cards.forEach((card, index) => { if (hasClass(card, SOLO) !== solo[index]) card.classList.toggle(SOLO, solo[index]); });
            }
        }

        /**
         * Find the page's sections and put each in its state: the user's fold,
         * else the default, else as the page drew it. Safe to call again at
         * any time; `sync` also looks for folds made in another window.
         */
        function refresh(settings = {}) {
            // A title line marked on its own makes the element it heads a panel.
            for (const header of host.querySelectorAll('.rr-db-fold-header')) {
                const parent = header.parentElement;
                if (!parent || header.closest(SECTIONS)) continue;
                parent.classList.add('rr-db-fold');
                const name = header.getAttribute('data-section-key');
                if (name && parent.getAttribute('data-section-key') === null) parent.setAttribute('data-section-key', name);
            }
            const sections = host.querySelectorAll(SECTIONS);
            if (!sections.length) return 0;
            if (settings.sync) store.sync();
            const current = page(), folder = project(), names = new Map();
            let count = 0;
            for (const section of sections) {
                const header = headerOf(section);
                if (!header || !foldable(section)) continue;
                let entry = entries.get(section);
                const first = !entry;
                if (first || entry.page !== current) {
                    const name = keyOf(section, header, i18n());
                    if (!name) continue;
                    entry = { key: name, page: current, collapsed: undefined, tabStop: !!(entry && entry.tabStop) };
                    entries.set(section, entry);
                }
                // A second section of the same name on the page is remembered by its place.
                const seen = (names.get(entry.key) || 0) + 1;
                names.set(entry.key, seen);
                const key = seen > 1 ? entry.key + '~' + seen : entry.key;
                let want = store.get(folder, current, key);
                if (want === undefined && options.defaults) want = options.defaults(current, key, section);
                // Never touched and no default: as its page drew it. A card kept on screen from another page
                // was folded there, not here.
                if (want === undefined) want = section.tagName === 'DETAILS' ? !section.open : (first ? hasClass(section, COLLAPSED) : !!entry.collapsed);
                entry.name = key;
                // A card drawn folded is told so too: its page started whatever it draws before the fold was known.
                mark(section, header, entry, !!want, !first || !!want);
                count++;
            }
            layout();
            return count;
        }

        function toggle(section, collapsed, settings = {}) {
            const entry = entries.get(section);
            if (!entry) return false;
            const next = collapsed === undefined ? !entry.collapsed : !!collapsed;
            mark(section, headerOf(section), entry, next, true);
            if (settings.remember !== false) store.set(project(), entry.page, entry.name || entry.key, next);
            layout();
            return true;
        }

        const onClick = event => {
            const target = event.target;
            if (!target || !target.closest) return;
            const header = target.closest(HEADERS);
            const section = header ? sectionOf(header) : null;
            if (!section || !entries.has(section)) return;
            const control = target.closest(CONTROLS);
            if (control && control !== header && header.contains(control)) return;
            // The fold below is the one way a card opens and closes: a <summary> must not also toggle by itself.
            if (header.tagName === 'SUMMARY' && event.preventDefault) event.preventDefault();
            toggle(section);
        };

        // Heard while the key travels down to its target, before any listener of the card itself: a list
        // card has shortcuts of its own (Enter edits the selected row, Delete removes it) for every key
        // pressed inside it, its title included.
        const onKeyDown = event => {
            const target = event.target;
            if (!target || !target.closest) return;
            const header = target.closest(HEADERS) === target ? target : null;
            const section = header ? sectionOf(header) : target;
            const entry = section ? entries.get(section) : null;
            if (!entry) return;
            if (header && (event.key === 'Enter' || event.key === ' ') && !event.altKey && !event.ctrlKey && !event.metaKey) {
                // The fold is the one thing these keys do on a title; a <summary> does not also toggle by itself.
                if (event.preventDefault) event.preventDefault();
                if (event.stopPropagation) event.stopPropagation();
                if (!event.repeat) toggle(section);
                return;
            }
            // Folded, the card shows nothing its shortcuts could act on.
            if (entry.collapsed && !PASS_KEYS.test(String(event.key)) && event.stopPropagation) event.stopPropagation();
        };

        // A card opened or closed by something else (a page's own code) keeps its class and aria in step.
        const onNativeToggle = event => {
            const section = event.target, entry = section && entries.get(section);
            if (!entry || section.tagName !== 'DETAILS' || entry.collapsed === !section.open) return;
            mark(section, headerOf(section), entry, !section.open, true);
            layout();
        };

        host.addEventListener('click', onClick);
        host.addEventListener('keydown', onKeyDown, true);
        host.addEventListener('toggle', onNativeToggle, true);

        // Sections a page adds or redraws after its first pass (a troop's pages, a list re-rendered) are found as they arrive.
        let observer = null, resizer = null;
        if (typeof view.MutationObserver === 'function') {
            observer = new view.MutationObserver(records => {
                for (const record of records) {
                    for (const node of record.addedNodes || []) {
                        if (node.nodeType !== 1) continue;
                        if (node.closest(SECTIONS + ', ' + HEADERS) === node || node.querySelector(SECTIONS + ', ' + HEADERS)) { refresh(); return; }
                    }
                }
            });
            observer.observe(host, { childList: true, subtree: true });
        }
        // The number of columns follows the pane's width.
        if (typeof view.ResizeObserver === 'function') {
            resizer = new view.ResizeObserver(() => layout());
            resizer.observe(host);
        }

        return {
            root: host,
            refresh,
            toggle,
            layout,
            isCollapsed(section) { const entry = entries.get(section); return !!(entry && entry.collapsed); },
            keyOfSection(section) { const entry = entries.get(section); return entry ? (entry.name || entry.key) : ''; },
            dispose() {
                host.removeEventListener('click', onClick);
                host.removeEventListener('keydown', onKeyDown, true);
                host.removeEventListener('toggle', onNativeToggle, true);
                if (observer) observer.disconnect();
                if (resizer) resizer.disconnect();
            }
        };
    }

    const api = {
        SECTIONS, HEADERS, CONTROLS, COLLAPSED, SOLO, FOLD_EVENT, FILE_NAME, STORAGE_KEY, STATE_DIR_ENV, MAP_MODES, PASS_KEYS,
        slug, titleOf, sourceOf, keyOf, parse, stateFolder, createStore, shared, recall, remember,
        SELECTION_FILE_NAME, SELECTION_STORAGE_KEY, createSelectionStore, recallSelection, rememberSelection,
        commandsUseMapBattle, textUsesMapBattle, textBattleModes, usesMapBattles, battleModes, battleCardFolded, createBattleScan,
        soloRows, headerOf, sectionOf, attach
    };
    root.RRDatabaseSections = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
