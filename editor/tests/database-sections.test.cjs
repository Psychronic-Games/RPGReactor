'use strict';
// Folding sections of the Database (src/utils/DatabaseSections.js, hosted by
// DatabaseEditorUI): what a section is called, where its fold is kept, the
// battle cards' default, the row a folded card takes, and the click and
// keys on a header. Every store in this file lives in a temp folder named
// by the same override the harnesses use; none reads or writes the real
// per-user file.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const S = require('../src/utils/DatabaseSections.js');
const { createElement } = require('./helpers/mini-dom.cjs');

const repoRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(repoRoot, file), 'utf8');
const temps = [];
const tempDir = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-dbsections-')); temps.push(dir); return dir; };
test.after(() => { for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true }); });

/** A store in a fresh temp folder, as an editor window started with the override would make it. */
function diskStore(dir = tempDir(), extra = {}) {
    return S.createStore(Object.assign({ fs, path, os, env: { [S.STATE_DIR_ENV]: dir }, platform: process.platform, warn: () => {} }, extra));
}

//-----------------------------------------------------------------------------
// The page under test, built the way the Database pages build theirs.

function el(tag, className, text) {
    const node = createElement(tag);
    node.nodeType = 1;
    // A listener added with `true` hears an event on its way down to the target, as in a browser.
    node.captures = {};
    const add = node.addEventListener.bind(node), remove = node.removeEventListener.bind(node);
    node.addEventListener = (type, handler, capture) => {
        if (capture === true) (node.captures[type] = node.captures[type] || []).push(handler);
        else add(type, handler);
    };
    node.removeEventListener = (type, handler, capture) => {
        if (capture === true) node.captures[type] = (node.captures[type] || []).filter(fn => fn !== handler);
        else remove(type, handler);
    };
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

/**
 * One event sent the way a browser sends it: down to its target through the
 * capturing listeners, then up through the others, until one stops it.
 * Returns the event, with `defaultPrevented` and `stopped`.
 */
function dispatch(target, type, init = {}) {
    const route = [];
    for (let node = target; node; node = node.parentNode) route.unshift(node);
    const event = Object.assign({ type, target, bubbles: true, defaultPrevented: false, stopped: false }, init);
    event.preventDefault = () => { event.defaultPrevented = true; };
    event.stopPropagation = () => { event.stopped = true; };
    const run = list => { for (const handler of (list || []).slice()) handler(event); };
    for (const node of route) {
        if (event.stopped) return event;
        run(node.captures && node.captures[type]);
    }
    if (event.stopped) return event;
    run(target.listeners[type]);
    if (event.bubbles) for (const node of route.slice(0, -1).reverse()) { if (event.stopped) break; run(node.listeners[type]); }
    return event;
}

function card(title, options = {}) {
    const section = el(options.tag || 'div', 'database-section' + (options.className ? ' ' + options.className : ''));
    const header = el(options.tag === 'details' ? 'summary' : 'div', 'database-section-header');
    if (options.parts) for (const part of options.parts) header.appendChild(part); else header.textContent = title;
    const content = el('div', 'database-section-content');
    section.append(header, content);
    if (options.key) section.setAttribute('data-section-key', options.key);
    if (options.tag === 'details') section.open = options.open !== false;
    return { section, header, content };
}

/** A detail pane holding a two-column grid of cards, and a window that says so. */
function pane(titles = ['General', 'Parameters', 'Traits', 'Tactics', 'Note']) {
    const host = el('div');
    const grid = el('div', 'database-sections-grid');
    host.appendChild(grid);
    const cards = {};
    for (const title of titles) {
        cards[title] = card(title, title === 'Tactics' ? { key: 'tactics' } : {});
        grid.appendChild(cards[title].section);
    }
    const events = [];
    const view = {
        getComputedStyle: element => ({ gridTemplateColumns: element === grid ? '500px 500px' : '' }),
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; this.bubbles = init.bubbles; } }
    };
    for (const name of titles) cards[name].section.addEventListener(S.FOLD_EVENT, event => events.push([name, event.detail.collapsed]));
    return { host, grid, cards, view, events };
}

const memoryStorage = () => { const map = new Map(); return { getItem: key => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), map }; };
/** A click or a key on `target`; true when its default was held back. */
const click = (host, target) => dispatch(target, 'click').defaultPrevented;
const press = (host, target, key, extra = {}) => dispatch(target, 'keydown', Object.assign({ key }, extra)).defaultPrevented;
const folded = section => section.classList.contains('is-collapsed');

/** The real label manager with its tables, in a page that has no document to speak of. */
let labels = null;
function labelManager() {
    if (labels) return labels;
    const store = new Map([['rr-settings', JSON.stringify({ language: 'en' })]]);
    const sandbox = {
        window: { dispatchEvent() {} },
        document: { readyState: 'complete', documentElement: {}, addEventListener() {}, querySelectorAll() { return []; } },
        localStorage: { getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)) },
        CustomEvent: class { constructor(type) { this.type = type; } }
    };
    sandbox.window.document = sandbox.document;
    sandbox.window.localStorage = sandbox.localStorage;
    const source = ['src/I18nDeepTranslations.js', 'src/I18nReviewedTranslations.js', 'src/I18nManager.js'].map(read).join('\n');
    labels = vm.runInNewContext(`${source}\n({ manager: window.I18n, tables: RR_TEXT_TRANSLATIONS });`, sandbox);
    return labels;
}

/**
 * The cards the Database pages title through the label manager, as
 * [file, key, English title], read from the pages' own source. A page whose
 * card has no name fails here.
 */
function namedCards() {
    const dir = path.join(repoRoot, 'src/database');
    // The panes of the two workspace pages stand round a canvas and do not fold.
    const skip = new Set(['DatabaseUserInterfaceEditor.js', 'DatabaseActionSequenceEditor.js']);
    const cards = [];
    for (const name of fs.readdirSync(dir).filter(file => file.endsWith('.js') && !skip.has(file)).sort()) {
        const source = fs.readFileSync(path.join(dir, name), 'utf8');
        for (const line of source.split('\n')) {
            if (!/class="database-section-header[^"]*"/.test(line)) continue;
            // The battle cards are named on the cards themselves.
            if (/rr-tactics-header/.test(line)) continue;
            assert.match(line, /data-section-key="[^"]+"/, `${name}: a card's header has no data-section-key: ${line.trim().slice(0, 100)}`);
            const pair = /data-section-key="([a-z0-9-]+)">\$\{(?:[\w.]+\()?tt\('([^']+)'\)/.exec(line);
            if (pair) cards.push([name, pair[1], pair[2]]);
        }
        assert.doesNotMatch(source, /this\.createSection\(tt\(/, `${name}: a card made with createSection() has no name; make it with keyedSection(key, title, content)`);
        for (const [, key, title] of source.matchAll(/this\.keyedSection\('([^']+)', tt\('([^']+)'\), /g)) cards.push([name, key, title]);
    }
    return cards;
}

//-----------------------------------------------------------------------------
// Names.

test('a section is named by its English title, as a slug', () => {
    assert.equal(S.slug('General Settings'), 'general-settings');
    assert.equal(S.slug('Traits & Effects'), 'traits-effects');
    assert.equal(S.slug('[SV] Magic Skills'), 'sv-magic-skills');
    assert.equal(S.slug('Physics (3D maps)'), 'physics-3d-maps');
    assert.equal(S.slug('  Note  '), 'note');
    assert.equal(S.slug('设置'), '设置', 'a title with no Latin letter keeps its own words');
});

test('the title is the header\'s words, never a control in it', () => {
    assert.equal(S.titleOf(card('Drop Items').header), 'Drop Items');
    const label = el('label', 'database-field-label', 'Target level'), field = el('input');
    const curves = card('', { parts: [el('span', '', 'Parameter Curves'), label, field] });
    assert.equal(S.titleOf(curves.header), 'Parameter Curves');
    const tactics = card('', { parts: [el('span', 'rr-tactics-title', 'Tactics'), el('span', 'rr-tactics-summary', 'Move 5'), el('button', 'rr-btn-chip', 'Automatic')] });
    assert.equal(S.titleOf(tactics.header), 'Tactics', 'the summary beside the title is not the name');
    const leading = card('', { parts: [el('button', '', 'Add'), el('span', '', 'Rewards')] });
    assert.equal(S.titleOf(leading.header), 'Rewards');
});

test('a translated title goes back to its English source', () => {
    const stamped = card('Paramètres');
    stamped.header.setAttribute('data-i18n-text-source', 'Parameters');
    assert.equal(S.keyOf(stamped.section, stamped.header, null), 'parameters', 'the label pass stamps the source on the header');
    const served = { _served: new Map([['Parámetros', { text: 'Parameters' }], ['Sistema 1', { key: 'db.system1' }]]) };
    const written = card('Parámetros');
    assert.equal(S.keyOf(written.section, written.header, served), 'parameters', 'a page that wrote the translation itself');
    assert.equal(S.sourceOf('Sistema 1', served), 'db.system1', 'a keyed string is named by its key');
    assert.equal(S.sourceOf('Never translated', served), 'Never translated');
    const own = card('Táctica', { key: 'tactics' });
    assert.equal(S.keyOf(own.section, own.header, served), 'tactics', 'a card\'s own key wins');
    const named = card('Parámetros');
    named.header.setAttribute('data-section-key', 'parameters');
    assert.equal(S.keyOf(named.section, named.header, { _served: new Map([['Parámetros', { text: 'Parameter' }]]) }), 'parameters', 'so does the key a page writes on the header');
});

test('a named card keeps its name in every language, whatever shares its translation', () => {
    const { manager, tables } = labelManager();
    const cards = namedCards();
    assert.ok(cards.length >= 83, `the pages name their cards (${cards.length} found)`);
    for (const [file, key, title] of cards) {
        // This heading now names both modes sharing the bindings; keep the old fold choice.
        const originalTitle = file === 'DatabaseControlsEditor.js' && title === 'Action and First Person Battles' ? 'Action battles' : title;
        assert.equal(key, S.slug(originalTitle), `${file}: "${title}" keeps its established fold key`);
    }
    const languages = Object.keys(tables).filter(language => language !== 'en');
    assert.ok(languages.length >= 16);
    let shared = 0;
    for (const language of languages) {
        manager.setLanguage(language, { persist: false, force: true });
        const twins = new Map();
        for (const [english, rendered] of Object.entries(tables[language])) {
            if (!twins.has(rendered)) twins.set(rendered, []);
            twins.get(rendered).push(english);
        }
        for (const [file, key, title] of cards) {
            const rendered = manager.tText(title);
            const item = card(rendered);
            item.header.setAttribute('data-section-key', key);
            // The page goes on to write every other string that reads the same in this language
            // (the card "Parameters", then its table's column "Parameter").
            for (const other of twins.get(rendered) || []) {
                if (other === title) continue;
                manager.tText(other);
                if (S.slug(other) !== key) shared++;
            }
            assert.equal(S.keyOf(item.section, item.header, manager), key, `${language}, ${file}: "${title}" rendered "${rendered}"`);
        }
    }
    assert.ok(shared > 100, `the languages do hold titles that read the same as another string (${shared})`);
    manager.setLanguage('en', { persist: false, force: true });
});

test('the label manager still says where a rendered label came from', () => {
    // sourceOf() reads the manager's map of served strings; this pins that contract against the real manager.
    const store = new Map([['rr-settings', JSON.stringify({ language: 'es' })]]);
    const sandbox = {
        window: { dispatchEvent() {} },
        document: { readyState: 'complete', documentElement: {}, addEventListener() {}, querySelectorAll() { return []; } },
        localStorage: { getItem: key => (store.has(key) ? store.get(key) : null), setItem: (key, value) => store.set(key, String(value)) },
        CustomEvent: class { constructor(type) { this.type = type; } }
    };
    sandbox.window.document = sandbox.document;
    sandbox.window.localStorage = sandbox.localStorage;
    const source = ['src/I18nDeepTranslations.js', 'src/I18nReviewedTranslations.js', 'src/I18nManager.js'].map(read).join('\n');
    const manager = vm.runInNewContext(`${source}\nwindow.I18n;`, sandbox);
    assert.equal(manager.currentLanguage(), 'es');
    for (const title of ['General', 'Parameters', 'Traits', 'Note', 'Battle Events']) {
        const rendered = manager.tText(title);
        assert.equal(S.sourceOf(rendered, manager), title, `${title} -> ${rendered}`);
    }
    assert.notEqual(manager.tText('Parameters'), 'Parameters', 'the page is not written in English here');
    // The manager's label pass reads a translated header back and asks for it under its own text;
    // the manager keeps the source it served the label from, so a language switch can relabel the page.
    const rendered = manager.tText('Parameters');
    assert.equal(S.sourceOf(rendered, manager), 'Parameters');
    assert.equal(manager.tText(rendered), rendered);
    assert.equal(manager._served.get(rendered).text, 'Parameters', 'a label read back does not replace where it came from');
    assert.equal(S.sourceOf(rendered, manager), 'Parameters');
    // A string never served before is still remembered under its own text.
    assert.equal(manager.tText('Zzz not a phrase'), 'Zzz not a phrase');
    assert.equal(manager._served.get('Zzz not a phrase').text, 'Zzz not a phrase');
});

//-----------------------------------------------------------------------------
// Memory.

test('the folds live in a per-user folder outside the editor profile, or where the override says', () => {
    assert.equal(S.stateFolder({ XDG_CONFIG_HOME: '/home/u/.config' }, 'linux', '/home/u', path.posix), '/home/u/.config/RPGReactor/EditorState');
    assert.equal(S.stateFolder({}, 'linux', '/home/u', path.posix), '/home/u/.config/RPGReactor/EditorState');
    assert.equal(S.stateFolder({}, 'darwin', '/Users/u', path.posix), '/Users/u/Library/Application Support/RPGReactor/EditorState');
    assert.equal(S.stateFolder({ LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, 'win32', 'C:\\Users\\u', path.win32), 'C:\\Users\\u\\AppData\\Local\\RPGReactor\\EditorState');
    assert.equal(S.stateFolder({}, 'win32', 'C:\\Users\\u', path.win32), 'C:\\Users\\u\\AppData\\Local\\RPGReactor\\EditorState');
    assert.equal(S.stateFolder({ [S.STATE_DIR_ENV]: '/tmp/x', XDG_CONFIG_HOME: '/home/u/.config' }, 'linux', '/home/u', path.posix), '/tmp/x', 'the override names the folder itself');
    const dir = tempDir();
    assert.equal(diskStore(dir).file, path.join(dir, 'database-sections.json'));
    // The release build names its browser profile after the version; the folder must not sit in one.
    assert.doesNotMatch(S.stateFolder({}, 'linux', '/home/u', path.posix), /rpg-reactor/);
});

test('a fold is kept per project, per page and per section, and a new window reads it', () => {
    const dir = tempDir(), projectA = path.join(dir, 'GameA'), projectB = path.join(dir, 'GameB');
    fs.mkdirSync(projectA); fs.mkdirSync(projectB);
    const store = diskStore(dir);
    assert.equal(store.get(projectA, 'armors', 'tactics'), undefined, 'never touched');
    assert.equal(store.set(projectA, 'armors', 'tactics', true), true);
    assert.equal(store.set(projectA, 'armors', 'note', false), true);
    assert.equal(store.get(projectA, 'armors', 'tactics'), true);
    assert.equal(store.get(projectA, 'armors', 'note'), false, 'an unfold is remembered too: it is the user\'s choice');
    assert.equal(store.get(projectA, 'weapons', 'tactics'), undefined, 'another page is its own');
    assert.equal(store.get(projectB, 'armors', 'tactics'), undefined, 'another project is its own');
    const restarted = diskStore(dir);
    assert.equal(restarted.get(projectA, 'armors', 'tactics'), true);
    assert.deepEqual(restarted.page(projectA, 'armors'), { tactics: true, note: false });
    const onDisk = JSON.parse(fs.readFileSync(store.file, 'utf8'));
    assert.equal(onDisk.version, 1);
    assert.deepEqual(Object.keys(onDisk.projects), [fs.realpathSync(projectA)]);
    assert.deepEqual(fs.readdirSync(projectA), [], 'nothing is written into the project');
    assert.deepEqual(fs.readdirSync(dir).filter(name => /tmp$/.test(name)), [], 'no temp file is left behind');
});

test('a project is the same however its path is written', () => {
    const dir = tempDir(), project = path.join(dir, 'Game');
    fs.mkdirSync(project);
    const store = diskStore(dir);
    store.set(project + path.sep, 'skills', 'damage', true);
    assert.equal(store.get(project, 'skills', 'damage'), true);
    assert.equal(store.get(path.join(dir, 'Other', '..', 'Game'), 'skills', 'damage'), true);
    const link = path.join(dir, 'link');
    try { fs.symlinkSync(project, link); } catch (error) { return; }
    assert.equal(store.get(link, 'skills', 'damage'), true, 'a link to the folder is the folder');
});

test('two windows keep each other\'s folds', () => {
    const dir = tempDir(), project = path.join(dir, 'Game');
    fs.mkdirSync(project);
    const first = diskStore(dir), second = diskStore(dir);
    first.set(project, 'armors', 'tactics', true);
    second.set(project, 'weapons', 'traits', true);
    first.set(project, 'armors', 'note', true);
    const file = JSON.parse(fs.readFileSync(first.file, 'utf8'));
    assert.deepEqual(file.projects[fs.realpathSync(project)], { armors: { tactics: true, note: true }, weapons: { traits: true } });
    second.sync();
    assert.equal(second.get(project, 'armors', 'note'), true, 'the other window\'s fold arrives on the next look');
});

test('a damaged file is ignored and rewritten, without an error', () => {
    const dir = tempDir(), project = path.join(dir, 'Game');
    fs.mkdirSync(project);
    const file = path.join(dir, 'database-sections.json');
    for (const damage of ['{"version":1,"projects":{"/x":{"armors":{"tactics":tr', '', 'null', '[1,2]', '{"projects":5}', '\u0000\u0000\u0000']) {
        fs.writeFileSync(file, damage);
        const warnings = [];
        const store = diskStore(dir, { warn: message => warnings.push(message) });
        assert.equal(store.get(project, 'armors', 'tactics'), undefined, JSON.stringify(damage));
        assert.equal(store.set(project, 'armors', 'tactics', true), true);
        assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { version: 1, projects: { [fs.realpathSync(project)]: { armors: { tactics: true } } } });
        assert.deepEqual(warnings, []);
    }
});

test('only well-formed folds are read from a file', () => {
    const parsed = S.parse(JSON.stringify({ version: 9, extra: 1, projects: {
        '/a': { armors: { tactics: true, note: 'yes', traits: 0 }, weapons: [], skills: { damage: false } },
        '/b': 'folded', '/c': { armors: {} }
    } }));
    assert.deepEqual(parsed, { version: 1, projects: { '/a': { armors: { tactics: true }, skills: { damage: false } } } });
});

test('a folder that cannot be written keeps the folds for the session and says so once', () => {
    const dir = tempDir(), blocker = path.join(dir, 'file');
    fs.writeFileSync(blocker, 'not a folder');
    const warnings = [];
    const store = diskStore(path.join(blocker, 'state'), { warn: message => warnings.push(message) });
    assert.equal(store.set('/game', 'armors', 'tactics', true), false);
    assert.equal(store.set('/game', 'armors', 'note', true), false);
    assert.equal(store.get('/game', 'armors', 'tactics'), true);
    assert.equal(warnings.length, 1);
});

test('the web edition keeps its folds in localStorage', () => {
    const storage = memoryStorage();
    const store = S.createStore({ storage });
    assert.equal(store.file, null);
    assert.equal(store.set('/project', 'armors', 'tactics', true), true);
    assert.deepEqual(JSON.parse(storage.map.get(S.STORAGE_KEY)).projects, { '/project': { armors: { tactics: true } } });
    assert.equal(S.createStore({ storage }).get('/project', 'armors', 'tactics'), true);
    storage.map.set(S.STORAGE_KEY, '{broken');
    assert.equal(S.createStore({ storage }).get('/project', 'armors', 'tactics'), undefined);
    const blocked = S.createStore({ storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }, warn: () => {} });
    assert.equal(blocked.get('/project', 'armors', 'tactics'), undefined);
    assert.equal(blocked.set('/project', 'armors', 'tactics', true), false);
    assert.equal(blocked.get('/project', 'armors', 'tactics'), true, 'kept for the session');
});

test('text that is not a memory reads as an empty one', () => {
    for (const text of ['{broken', '', 'null', '7', '"folded"', undefined, null]) assert.deepEqual(S.parse(text), { version: 1, projects: {} }, JSON.stringify(text));
});

test('a file that cannot be replaced by a rename is written in place', () => {
    const dir = tempDir(), project = path.join(dir, 'Game');
    fs.mkdirSync(project);
    // Windows refuses the rename while another program holds the file.
    const held = Object.assign({}, fs, { renameSync() { const error = new Error('EPERM: operation not permitted, rename'); error.code = 'EPERM'; throw error; } });
    const warnings = [];
    const store = diskStore(dir, { fs: held, warn: message => warnings.push(message) });
    assert.equal(store.set(project, 'armors', 'tactics', true), true);
    assert.equal(store.set(project, 'armors', 'note', true), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(store.file, 'utf8')).projects[fs.realpathSync(project)], { armors: { tactics: true, note: true } });
    assert.deepEqual(fs.readdirSync(dir).filter(name => /tmp$/.test(name)), [], 'the temp file is taken away');
    assert.deepEqual(warnings, []);
    assert.equal(diskStore(dir).get(project, 'armors', 'note'), true);
});

test('on Windows a project is the same folder in any letter case', () => {
    const missing = () => { throw new Error('ENOENT'); };
    const store = S.createStore({ fs: { realpathSync: folder => folder, statSync: missing, readFileSync: missing }, path: path.win32, os, env: { [S.STATE_DIR_ENV]: 'C:\\State' }, platform: 'win32', warn: () => {} });
    assert.equal(store.projectKey('C:\\Games\\Demo'), 'c:\\games\\demo');
    assert.equal(store.projectKey('c:\\games\\DEMO\\'), 'c:\\games\\demo');
    const posix = S.createStore({ fs: { realpathSync: folder => folder, statSync: missing, readFileSync: missing }, path: path.posix, os, env: { [S.STATE_DIR_ENV]: '/state' }, platform: 'linux', warn: () => {} });
    assert.equal(posix.projectKey('/Games/Demo'), '/Games/Demo', 'elsewhere two cases are two folders');
});

test('the web edition has no disk even where Node is there to ask', () => {
    const source = read('src/utils/DatabaseSections.js');
    const load = window => vm.runInNewContext(`${source}\nwindow.RRDatabaseSections;`, { window, process, require, module: undefined });
    const storage = memoryStorage(), host = {};
    const web = load({ RPGReactorWebHost: host, RPGReactorHost: host, localStorage: storage });
    const store = web.createStore({ env: { [S.STATE_DIR_ENV]: tempDir() }, warn: () => {} });
    assert.equal(store.file, null, 'the web host: localStorage');
    assert.equal(store.set('/project', 'armors', 'tactics', true), true);
    assert.equal(JSON.parse(storage.map.get(S.STORAGE_KEY)).projects['/project'].armors.tactics, true);
    const dir = tempDir();
    const desktop = load({ RPGReactorWebHost: host, RPGReactorHost: {}, localStorage: memoryStorage() }).createStore({ env: { [S.STATE_DIR_ENV]: dir }, warn: () => {} });
    assert.equal(desktop.file, path.join(dir, 'database-sections.json'), 'the desktop host: the per-user file');
});

//-----------------------------------------------------------------------------
// The record last selected on each list page.

/** A selection store in a temp folder, as an editor window started with the override would make it. */
function selectionStore(dir = tempDir(), extra = {}) {
    return S.createSelectionStore(Object.assign({ fs, path, os, env: { [S.STATE_DIR_ENV]: dir }, platform: process.platform, warn: () => {} }, extra));
}

test('the record selected on a page is kept per project and per page, in a file of its own, and a new window reads it', () => {
    const dir = tempDir(), projectA = path.join(dir, 'GameA'), projectB = path.join(dir, 'GameB');
    fs.mkdirSync(projectA); fs.mkdirSync(projectB);
    const store = selectionStore(dir), folds = diskStore(dir);
    assert.equal(store.file, path.join(dir, 'database-selection.json'));
    assert.notEqual(store.file, folds.file);
    assert.equal(store.get(projectA, 'items', 'id'), undefined, 'never selected');
    assert.equal(store.set(projectA, 'items', 'id', 9), true);
    assert.equal(store.set(projectA, 'weapons', 'id', 3), true);
    // The stock rows of Vehicles are numbered below zero.
    assert.equal(store.set(projectA, 'vehicles', 'id', -2), true);
    assert.equal(folds.set(projectA, 'items', 'general', true), true);
    assert.deepEqual([store.get(projectA, 'items', 'id'), store.get(projectA, 'weapons', 'id'), store.get(projectA, 'vehicles', 'id')], [9, 3, -2]);
    assert.equal(store.get(projectB, 'items', 'id'), undefined, 'another project is its own');
    const restarted = selectionStore(dir);
    assert.equal(restarted.get(projectA, 'items', 'id'), 9);
    assert.deepEqual(JSON.parse(fs.readFileSync(store.file, 'utf8')), { version: 1, projects: { [fs.realpathSync(projectA)]: { items: { id: 9 }, weapons: { id: 3 }, vehicles: { id: -2 } } } });
    assert.deepEqual(JSON.parse(fs.readFileSync(folds.file, 'utf8')).projects[fs.realpathSync(projectA)], { items: { general: true } }, 'the folds are not mixed with it');
    assert.deepEqual(fs.readdirSync(projectA), [], 'nothing is written into the project');
});

test('a selection is a whole number: anything else is neither kept nor read, and the same record is not written twice', () => {
    const dir = tempDir(), store = selectionStore(dir);
    for (const bad of ['7', 7.5, true, null, undefined, NaN, {}]) assert.equal(store.set('/project', 'items', 'id', bad), false, String(bad));
    assert.equal(fs.existsSync(store.file), false, 'nothing was written');
    assert.equal(store.set('/project', 'items', 'id', 7), true);
    const written = fs.statSync(store.file).mtimeMs;
    fs.utimesSync(store.file, new Date(1000), new Date(1000));
    assert.equal(store.set('/project', 'items', 'id', 7), true);
    assert.equal(fs.statSync(store.file).mtimeMs, 1000, 'the file is left alone when the record is the same');
    assert.ok(written > 1000);
    // A file someone damaged, or one that holds folds: read as far as it is a selection.
    fs.writeFileSync(store.file, JSON.stringify({ version: 1, projects: { '/project': { items: { id: '9' }, weapons: { id: 4, general: true }, skills: 'x' } } }));
    const reread = selectionStore(dir);
    assert.equal(reread.get('/project', 'items', 'id'), undefined);
    assert.equal(reread.get('/project', 'weapons', 'id'), 4);
    assert.equal(reread.get('/project', 'weapons', 'general'), undefined);
    fs.writeFileSync(store.file, '{ not json');
    assert.equal(selectionStore(dir).get('/project', 'weapons', 'id'), undefined);
});

test('the web edition keeps the selections in localStorage, apart from the folds', () => {
    const storage = memoryStorage();
    const store = S.createSelectionStore({ storage });
    assert.equal(store.file, null);
    assert.equal(store.set('/project', 'actors', 'id', 4), true);
    assert.deepEqual(JSON.parse(storage.map.get(S.SELECTION_STORAGE_KEY)).projects, { '/project': { actors: { id: 4 } } });
    assert.equal(storage.map.has(S.STORAGE_KEY), false);
    assert.equal(S.createSelectionStore({ storage }).get('/project', 'actors', 'id'), 4);
});

//-----------------------------------------------------------------------------
// The battle cards' default.

const command =(name, args) => ({ code: 357, indent: 0, parameters: ['RPGReactor', name, '', args || {}] });

test('a project fights on the map when the game, a troop, a map or a command says so', () => {
    const classic = { system: { reactorBattle: { mode: 'classic' } }, troops: [null, { pages: [{ list: [{ code: 301, parameters: [0, 1, false, false] }] }] }], commonEvents: [null, { list: [{ code: 0 }] }] };
    assert.equal(S.usesMapBattles({}), false, 'stock data says nothing');
    assert.equal(S.usesMapBattles({ system: {} }), false);
    assert.equal(S.usesMapBattles(classic), false, 'Battle Processing is a Classic battle');
    for (const mode of ['tactical', 'action', 'firstPerson']) assert.equal(S.usesMapBattles({ system: { reactorBattle: { mode } } }), true, mode);
    assert.equal(S.usesMapBattles({ system: { reactorBattle: { mode: 'sideways' } } }), false, 'an unknown mode is not a mode');
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { troops: [null, { reactorBattle: { mode: 'tactical' } }] })), true);
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { troops: [null, { pages: [{ list: [command('StartMapBattle', { troopId: '1', mode: 'tactical' })] }] }] })), true);
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { commonEvents: [null, { list: [command('ChangeBattleMode', { mode: 'action', scope: 'game' })] }] })), true);
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { commonEvents: [null, { list: [command('ChangeBattleMode', { mode: 'classic', scope: 'game' }), command('ChangeBattleMode', { mode: 'default' })] }] })), false);
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { openMap: { note: '<3d>', events: [] } })), false);
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { openMap: { note: '<3d>\n<Battle Mode: FirstPerson>' } })), true);
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { openMap: { note: '<battle mode: classic>' } })), false);
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { openMap: { note: '', reactor3d: { battle: { mode: 'tactical' } } } })), true);
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { openMap: { note: '', events: [null, { pages: [{ list: [command('StartMapBattle', { mode: 'firstPerson', troopId: 0 })] }] }] } })), true);
    // A start that names no mode fights in the mode in force: placed enemies on a Classic map open the battle screen.
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { openMap: { note: '<battle trigger: 6>' } })), false);
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { openMap: { note: '', reactor3d: { battle: { trigger: 6 } } } })), false);
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { openMap: { note: '', events: [null, { pages: [{ list: [command('StartMapBattle')] }] }] } })), false);
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { troops: [null, { pages: [{ list: [command('StartMapBattle', { troopId: '1', mode: 'default' })] }] }] })), false);
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { maps: false })), false);
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { maps: undefined })), false, 'before the map files were read');
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { maps: true })), true, 'a map file names a mode');
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { maps: { tactical: false, action: true } })), true, 'and says which');
    assert.equal(S.usesMapBattles(Object.assign({}, classic, { maps: { tactical: false, action: false } })), false);
});

test('each way of fighting on the map is counted by itself: Tactical, and Action with First Person', () => {
    const classic = { system: { reactorBattle: { mode: 'classic' } }, troops: [null, { pages: [{ list: [{ code: 301, parameters: [0, 1, false, false] }] }] }], commonEvents: [null, { list: [{ code: 0 }] }] };
    const modes = extra => { const found = S.battleModes(Object.assign({}, classic, extra)); return [found.tactical, found.action]; };
    assert.deepEqual(modes({}), [false, false], 'a Classic project fights neither way');
    assert.deepEqual(S.battleModes(), { tactical: false, action: false });
    assert.deepEqual(modes({ system: { reactorBattle: { mode: 'tactical' } } }), [true, false], 'a Tactical game');
    assert.deepEqual(modes({ system: { reactorBattle: { mode: 'action' } } }), [false, true]);
    assert.deepEqual(modes({ system: { reactorBattle: { mode: 'firstPerson' } } }), [false, true], 'First Person fights with the Action settings');
    assert.deepEqual(modes({ system: { reactorBattle: { mode: 'sideways' } } }), [false, false]);
    assert.deepEqual(modes({ troops: [null, { reactorBattle: { mode: 'action' } }] }), [false, true], 'a troop\'s mode');
    assert.deepEqual(modes({ troops: [null, { pages: [{ list: [command('StartMapBattle', { troopId: '1', mode: 'tactical' })] }] }] }), [true, false], 'a command of a troop page');
    assert.deepEqual(modes({ commonEvents: [null, { list: [command('ChangeBattleMode', { mode: 'firstPerson', scope: 'game' })] }] }), [false, true], 'a common event');
    assert.deepEqual(modes({ openMap: { note: '<3d>\n<Battle Mode: FirstPerson>' } }), [false, true], 'the open map\'s tag');
    assert.deepEqual(modes({ openMap: { note: '<battle mode: tactical>' } }), [true, false]);
    assert.deepEqual(modes({ openMap: { note: '', reactor3d: { battle: { mode: 'action' } } } }), [false, true], 'the open map\'s mode');
    assert.deepEqual(modes({ openMap: { note: '', events: [null, { pages: [{ list: [command('StartMapBattle', { mode: 'tactical', troopId: 0 })] }, { list: [command('StartMapBattle', { mode: 'action', troopId: 0 })] }] }] } }), [true, true], 'two events of the open map');
    assert.deepEqual(modes({ maps: { tactical: false, action: true } }), [false, true], 'what the map files said');
    assert.deepEqual(modes({ system: { reactorBattle: { mode: 'tactical' } }, maps: { tactical: false, action: true } }), [true, true]);
    // A start that names no mode fights in the mode in force there, the map's or else the game's: that
    // mode is counted where it is named, and in a Classic project the start opens neither card.
    assert.deepEqual(modes({ openMap: { note: '<battle trigger: 6>' } }), [false, false]);
    assert.deepEqual(modes({ openMap: { note: '', reactor3d: { battle: { trigger: 6 } }, events: [null, { pages: [{ list: [command('StartMapBattle')] }] }] } }), [false, false]);
    assert.deepEqual(modes({ troops: [null, { pages: [{ list: [command('StartMapBattle', { troopId: '1', mode: 'default' })] }] }] }), [false, false]);
    assert.deepEqual(modes({ system: { reactorBattle: { mode: 'action' } }, openMap: { note: '<battle trigger: 6>' } }), [false, true], 'the game\'s mode is the one in force');
    assert.deepEqual(modes({ openMap: { note: '<battle mode: tactical>\n<battle trigger: 6>', events: [null, { pages: [{ list: [command('StartMapBattle')] }] }] } }), [true, false], 'the map\'s mode is the one in force');
    assert.deepEqual(modes({ maps: true }), [false, false], 'a find that cannot say which way opens neither card');
    assert.deepEqual(modes({ maps: undefined }), [false, false], 'before the map files were read');
});

test('a battle card nobody touched is folded until the project fights its way, or its record sets something in it', () => {
    const marked = (mark, inUse) => { const item = card('Battles'); if (mark) item.section.setAttribute('data-section-default', mark); if (inUse) item.section.setAttribute('data-section-in-use', 'true'); return item.section; };
    const none = { tactical: false, action: false }, tactical = { tactical: true, action: false }, action = { tactical: false, action: true };
    assert.equal(S.battleCardFolded('note', marked(''), tactical), undefined, 'any other card is left as its page drew it');
    assert.equal(S.battleCardFolded('note', null, tactical), undefined);
    for (const [mark, classic, inTactical, inAction] of [['tactical-battles', true, false, true], ['action-battles', true, true, false], ['map-battles', true, false, false]]) {
        assert.deepEqual([none, tactical, action].map(modes => S.battleCardFolded('some-card', marked(mark), modes)), [classic, inTactical, inAction], mark);
        assert.deepEqual([none, tactical, action].map(modes => S.battleCardFolded('some-card', marked(mark, true), modes)), [false, false, false], mark + ': a record that sets something in the card shows it');
    }
    // The card named "tactics" that says nothing follows any battle on the map; what it says wins over its name.
    assert.deepEqual([none, tactical, action].map(modes => S.battleCardFolded('tactics', marked(''), modes)), [true, false, false]);
    assert.deepEqual([none, tactical, action].map(modes => S.battleCardFolded('tactics', marked('tactical-battles'), modes)), [true, false, true]);
    // The project is asked only for a battle card.
    let asked = 0;
    const ask = () => { asked++; return action; };
    assert.equal(S.battleCardFolded('note', marked(''), ask), undefined);
    assert.equal(S.battleCardFolded('action', marked('action-battles', true), ask), false);
    assert.equal(asked, 0);
    assert.equal(S.battleCardFolded('action', marked('action-battles'), ask), false);
    assert.equal(asked, 1);
    assert.equal(S.battleCardFolded('tactics', marked('tactical-battles'), undefined), true, 'nothing known: folded');
});

test('a map file\'s text is read for a battle on the map without parsing it', () => {
    const map = extra => JSON.stringify(Object.assign({ displayName: 'Battle of the Bridge', note: '', data: [0, 1, 2], events: [null, { id: 1, pages: [{ list: [{ code: 301, indent: 0, parameters: [0, 1, false, false] }, { code: 0 }] }] }] }, extra));
    assert.equal(S.textUsesMapBattle(map({})), false, 'a plain map with a Classic battle');
    assert.equal(S.textUsesMapBattle(map({ note: 'fog\n<battle mode: tactical>' })), true);
    assert.equal(S.textUsesMapBattle(map({ note: '<battle mode: classic>' })), false);
    assert.equal(S.textUsesMapBattle(map({ note: '<battle trigger: 5>' })), false, 'a start rule names no mode');
    assert.equal(S.textUsesMapBattle(map({ events: [null, { pages: [{ list: [command('StartMapBattle', { troopId: '2' })] }] }] })), false, 'nor does a start command without one');
    assert.equal(S.textUsesMapBattle(map({ events: [null, { pages: [{ list: [command('StartMapBattle', { mode: 'tactical', troopId: 0, turns: 'team' })] }] }] })), true);
    // As the editor writes a map: one value to a line.
    assert.equal(S.textUsesMapBattle(JSON.stringify({ events: [null, { pages: [{ list: [{ code: 357, indent: 0, parameters: ['RPGReactor', 'StartMapBattle', 'Start Battle on Map', { mode: 'firstPerson', troopId: 0 }] }] }] }] }, null, 2)), true);
    assert.equal(S.textUsesMapBattle(map({ events: [null, { pages: [{ list: [command('StartMapBattle', { troopId: 0 })] }, { list: [{ code: 108, parameters: ['"mode":"tactical"'] }] }] }] })), false, 'a mode named after the command\'s own arguments is not its mode');
    assert.equal(S.textUsesMapBattle(map({ events: [null, { pages: [{ list: [command('ChangeBattleMode', { scope: 'map', mode: 'firstPerson' })] }] }] })), true);
    assert.equal(S.textUsesMapBattle(map({ events: [null, { pages: [{ list: [command('ChangeBattleMode', { scope: 'map', mode: 'classic' })] }, { list: [{ code: 108, parameters: ['"mode":"tactical"'] }] }] }] })), false, 'a mode named after the command\'s own arguments is not its mode');
    assert.equal(S.textUsesMapBattle(JSON.stringify({ pieces: [], battle: { turns: 'team', mode: 'action' } })), true, 'a 3D sidecar');
    assert.equal(S.textUsesMapBattle(JSON.stringify({ pieces: [], battle: { mode: 'classic' } })), false);
    assert.equal(S.textUsesMapBattle(''), false);
    // Which way each file fights: every command of the file is heard, not only the first.
    const ways = text => { const found = S.textBattleModes(text); return [found.tactical, found.action]; };
    assert.deepEqual(ways(map({})), [false, false]);
    assert.deepEqual(ways(map({ note: 'fog\n<battle mode: tactical>' })), [true, false]);
    assert.deepEqual(ways(map({ note: '<Battle Mode: FirstPerson>' })), [false, true]);
    assert.deepEqual(ways(map({ note: '<battle trigger: 5>' })), [false, false]);
    assert.deepEqual(ways(map({ events: [null, { pages: [{ list: [command('StartMapBattle', { troopId: '2' })] }] }] })), [false, false]);
    assert.deepEqual(ways(map({ events: [null, { pages: [{ list: [command('StartMapBattle', { mode: 'tactical', troopId: 0 })] }] }, { pages: [{ list: [command('StartMapBattle', { mode: 'firstPerson', troopId: 0 })] }] }] })), [true, true]);
    assert.deepEqual(ways(map({ events: [null, { pages: [{ list: [command('StartMapBattle', { mode: 'action', troopId: 0 }), command('StartMapBattle', { mode: 'action', troopId: 1 })] }] }] })), [false, true]);
    assert.deepEqual(ways(map({ events: [null, { pages: [{ list: [command('ChangeBattleMode', { scope: 'map', mode: 'classic' })] }, { list: [{ code: 108, parameters: ['"mode":"tactical"'] }] }] }] })), [false, false]);
    assert.deepEqual(ways(JSON.stringify({ pieces: [], battle: { turns: 'team', mode: 'action' } })), [false, true]);
    assert.deepEqual(ways(JSON.stringify({ pieces: [], battle: { mode: 'tactical' } })), [true, false]);
    assert.deepEqual(ways(''), [false, false]);
    // The same text asked twice says the same (the patterns keep no place between questions).
    const both = map({ events: [null, { pages: [{ list: [command('StartMapBattle', { mode: 'action', troopId: 0 }), command('StartMapBattle', { mode: 'tactical', troopId: 0 })] }] }] });
    assert.deepEqual([ways(both), ways(both), S.textUsesMapBattle(both)], [[true, true], [true, true], true]);
});

test('the map files are scanned once and read again only when they change', async () => {
    const dir = tempDir();
    const reads = [];
    const counting = Object.assign({}, fs, { promises: Object.assign({}, fs.promises, { readFile: (file, encoding) => { reads.push(path.basename(file)); return fs.promises.readFile(file, encoding); } }) });
    const scan = S.createBattleScan({ fs: counting, path });
    fs.writeFileSync(path.join(dir, 'Map001.json'), JSON.stringify({ note: '', events: [] }));
    fs.writeFileSync(path.join(dir, 'Map002.json'), JSON.stringify({ note: '<3d>', events: [] }));
    fs.writeFileSync(path.join(dir, 'Map002.r3d.json'), JSON.stringify({ pieces: [] }));
    fs.writeFileSync(path.join(dir, 'MapInfos.json'), '[null,{"id":1,"note":"<battle mode: tactical>"}]');
    fs.writeFileSync(path.join(dir, 'System.json'), '{"StartMapBattle":1}');
    assert.equal(scan.uses(dir), undefined, 'nothing is known before the first scan ends');
    assert.equal(await scan.run(dir), false);
    assert.equal(scan.uses(dir), false);
    assert.deepEqual(reads.sort(), ['Map001.json', 'Map002.json', 'Map002.r3d.json'], 'only the map files are read');
    reads.length = 0;
    assert.equal(await scan.run(dir), false);
    assert.deepEqual(reads, [], 'unchanged files are not read again');
    fs.writeFileSync(path.join(dir, 'Map002.r3d.json'), JSON.stringify({ pieces: [], battle: { mode: 'tactical' } }));
    assert.equal(await scan.run(dir), true);
    assert.deepEqual(reads, ['Map002.r3d.json']);
    assert.equal(scan.uses(dir), true);
    assert.equal(await S.createBattleScan({ fs, path }).run(path.join(dir, 'missing')), false, 'a project with no data folder');
});

test('the scan of the map files says which way each battle on the map is fought', async () => {
    const dir = tempDir();
    const reads = [];
    const counting = Object.assign({}, fs, { promises: Object.assign({}, fs.promises, { readFile: (file, encoding) => { reads.push(path.basename(file)); return fs.promises.readFile(file, encoding); } }) });
    const scan = S.createBattleScan({ fs: counting, path });
    const start = mode => ({ note: '', events: [null, { pages: [{ list: [command('StartMapBattle', { mode, troopId: 0 })] }] }] });
    fs.writeFileSync(path.join(dir, 'Map001.json'), JSON.stringify({ note: '', events: [] }));
    fs.writeFileSync(path.join(dir, 'Map002.json'), JSON.stringify(start('tactical')));
    fs.writeFileSync(path.join(dir, 'Map003.json'), JSON.stringify({ note: '', events: [] }));
    assert.equal(scan.modes(dir), undefined, 'nothing is known before the first scan ends');
    assert.equal(await scan.run(dir), true);
    assert.deepEqual(scan.modes(dir), { tactical: true, action: false }, 'a Tactical map does not answer for Action');
    assert.deepEqual(reads.sort(), ['Map001.json', 'Map002.json', 'Map003.json'], 'the maps after the first find are read too');
    reads.length = 0;
    fs.writeFileSync(path.join(dir, 'Map003.r3d.json'), JSON.stringify({ pieces: [], battle: { mode: 'firstPerson' } }));
    assert.equal(await scan.run(dir), true);
    assert.deepEqual(scan.modes(dir), { tactical: true, action: true });
    assert.deepEqual(reads, ['Map003.r3d.json'], 'and only what changed is read again');
    assert.equal(scan.uses(dir), true);
    // The battles are taken out again: both answers follow.
    fs.writeFileSync(path.join(dir, 'Map002.json'), JSON.stringify({ note: 'no battle here at all', events: [] }));
    fs.rmSync(path.join(dir, 'Map003.r3d.json'));
    assert.equal(await scan.run(dir), false);
    assert.deepEqual(scan.modes(dir), { tactical: false, action: false });
    assert.equal(scan.uses(dir), false);
    // With both ways found, the files after that are left unread.
    const full = tempDir();
    for (const name of ['Map001.json', 'Map002.json', 'Map003.json']) {
        fs.writeFileSync(path.join(full, name), JSON.stringify({ note: '<battle mode: tactical>', events: start('action').events }));
    }
    reads.length = 0;
    await scan.run(full);
    assert.deepEqual(scan.modes(full), { tactical: true, action: true });
    assert.equal(reads.length, 1);
});

//-----------------------------------------------------------------------------
// Layout.

test('a row with a folded card gives every card of it a row of its own', () => {
    const cards = flags => flags.split('').map(flag => ({ collapsed: flag === '-', full: flag === 'F' }));
    const solo = (flags, columns = 2) => S.soloRows(cards(flags), columns).map(on => (on ? 'S' : '.')).join('');
    assert.equal(solo('++++++'), '......', 'nothing folded, nothing changes');
    assert.equal(solo('+-++++'), 'SS....', 'the card beside a folded one takes the row');
    assert.equal(solo('-+++++'), 'SS....', 'folding the left card does not re-pair the rows below');
    assert.equal(solo('++++-+'), '....SS');
    assert.equal(solo('++--++'), '..SS..');
    assert.equal(solo('+++++-'), '....SS');
    assert.equal(solo('++++-'), '....S', 'a folded card alone on the last row');
    assert.equal(solo('+F-+'), '..SS', 'a card that spans the grid is a row of its own');
    assert.equal(solo('-F++'), 'S...');
    assert.equal(solo('+-+-', 4), 'SSSS');
    assert.equal(solo('+-++', 1), '....', 'one column: every card already has its row');
    assert.equal(solo('+-++', 0), '....', 'a grid that is not laid out');
});

//-----------------------------------------------------------------------------
// The click, the keys and the classes.

test('every card gets a header that says it folds, and a click folds it', () => {
    const { host, cards, view, events } = pane();
    const store = S.createStore({ storage: memoryStorage() });
    const sections = S.attach(host, { store, view, page: () => 'armors', project: () => '/game' });
    assert.equal(sections.refresh(), 5);
    for (const { header, section } of Object.values(cards)) {
        assert.equal(header.getAttribute('aria-expanded'), 'true');
        assert.equal(header.getAttribute('role'), 'button');
        assert.equal(header.getAttribute('tabindex'), '0', 'reachable with Tab');
        assert.equal(folded(section), false, 'never touched: open');
    }
    click(host, cards.Tactics.header);
    assert.equal(folded(cards.Tactics.section), true);
    assert.equal(cards.Tactics.header.getAttribute('aria-expanded'), 'false');
    assert.equal(store.get('/game', 'armors', 'tactics'), true);
    // General | Parameters / Traits | Tactics / Note: Traits shares the folded card's row.
    assert.equal(cards.Traits.section.classList.contains('rr-section-solo'), true, 'the card beside it takes the room');
    assert.equal(cards.Tactics.section.classList.contains('rr-section-solo'), true, 'the folded card is a bar across the row');
    assert.equal(cards.General.section.classList.contains('rr-section-solo'), false);
    assert.equal(cards.Note.section.classList.contains('rr-section-solo'), false);
    click(host, cards.Tactics.header);
    assert.equal(folded(cards.Tactics.section), false);
    assert.equal(store.get('/game', 'armors', 'tactics'), false, 'the unfold is the user\'s choice too');
    assert.equal(cards.Traits.section.classList.contains('rr-section-solo'), false, 'and the row is two cards again');
    assert.deepEqual(events, [['Tactics', true], ['Tactics', false]], 'the card hears its own fold, to stop and start drawing');
});

test('a click on a control in a header is the control\'s, and the content is not a header', () => {
    const button = el('button', 'rr-btn-chip', 'Automatic'), label = el('label', '', 'Show Battle UI'), box = el('input'), title = el('span', 'rr-tactics-title', 'Tactics');
    label.appendChild(box);
    const { host, view, grid } = pane([]);
    const tactics = card('', { key: 'tactics', parts: [title, el('span', 'rr-tactics-summary', 'Move 5'), button, label] });
    grid.appendChild(tactics.section);
    const field = el('input');
    tactics.content.appendChild(field);
    const store = S.createStore({ storage: memoryStorage() });
    const sections = S.attach(host, { store, view, page: () => 'actors', project: () => '/game' });
    sections.refresh();
    for (const target of [button, label, box, field, tactics.content]) {
        click(host, target);
        assert.equal(folded(tactics.section), false, target.tagName + ' does what it did');
    }
    assert.equal(store.get('/game', 'actors', 'tactics'), undefined);
    click(host, title);
    assert.equal(folded(tactics.section), true, 'the title folds');
    click(host, tactics.header.children[1]);
    assert.equal(folded(tactics.section), false, 'so does the summary beside it');
});

test('Enter and Space on a header fold it; keys in a field are the field\'s', () => {
    const { host, cards, view } = pane();
    const store = S.createStore({ storage: memoryStorage() });
    S.attach(host, { store, view, page: () => 'armors', project: () => '/game' }).refresh();
    assert.equal(press(host, cards.Note.header, 'Enter'), true, 'the key is taken');
    assert.equal(folded(cards.Note.section), true);
    assert.equal(press(host, cards.Note.header, ' '), true, 'Space does not scroll the page');
    assert.equal(folded(cards.Note.section), false);
    for (const key of ['Tab', 'Escape', 'ArrowDown', 'a']) {
        assert.equal(press(host, cards.Note.header, key), false, key + ' is left to the dialog');
        assert.equal(folded(cards.Note.section), false);
    }
    assert.equal(press(host, cards.Note.header, 'Enter', { ctrlKey: true }), false);
    const field = el('textarea');
    cards.Note.content.appendChild(field);
    assert.equal(press(host, field, 'Enter'), false);
    assert.equal(press(host, field, ' '), false);
    assert.equal(folded(cards.Note.section), false);
    // A key held down folds once.
    press(host, cards.Note.header, 'Enter');
    assert.equal(press(host, cards.Note.header, 'Enter', { repeat: true }), true, 'the repeat is still taken');
    assert.equal(folded(cards.Note.section), true);
});

test('a list card\'s own shortcuts never act from its title, nor on what a folded card hides', () => {
    // The Traits card of a record page: it takes focus, and every key pressed in it is looked at by
    // the card (Enter edits the selected row, Delete removes it, Ctrl+V pastes), as the pages do it.
    const dialog = el('div'), { host, cards, view } = pane(['General', 'Traits', 'Note']);
    dialog.appendChild(host);
    const traits = cards.Traits, acted = [], reached = [];
    traits.section.setAttribute('tabindex', '0');
    traits.section.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === 'Delete' || (event.ctrlKey && event.key === 'v')) {
            event.preventDefault();
            event.stopPropagation();
            acted.push(event.key);
        }
    });
    dialog.addEventListener('keydown', event => reached.push(event.key));
    const store = S.createStore({ storage: memoryStorage() });
    S.attach(host, { store, view, page: () => 'armors', project: () => '/game' }).refresh();
    assert.equal(traits.section.getAttribute('tabindex'), '0', 'open: the card is a Tab stop, as its page made it');

    // Open, a row selected: Enter on the title folds the card and does not open the row.
    assert.equal(press(host, traits.header, 'Enter'), true);
    assert.equal(folded(traits.section), true);
    assert.deepEqual(acted, [], 'Enter on the title is the fold\'s');
    assert.equal(traits.section.getAttribute('tabindex'), '-1', 'folded: the title is the one Tab stop');
    assert.equal(cards.General.section.getAttribute('tabindex'), null, 'a card that takes no focus is given none');

    // Folded: nothing the card hides is edited, removed or pasted over, from the title or from the card.
    for (const target of [traits.header, traits.section]) {
        const removal = dispatch(target, 'keydown', { key: 'Delete' });
        assert.equal(removal.defaultPrevented, false);
        dispatch(target, 'keydown', { key: 'v', ctrlKey: true });
        dispatch(target, 'keydown', { key: 'Enter', ctrlKey: true });
    }
    dispatch(traits.section, 'keydown', { key: 'Enter' });
    assert.deepEqual(acted, [], 'the hidden row is out of reach');
    assert.equal(folded(traits.section), true, 'Enter on the card itself is not a fold either');
    // The dialog still hears the keys that are its own.
    reached.length = 0;
    for (const key of ['Tab', 'Escape', 'F5', 'F11', 'Delete', 'a']) dispatch(traits.header, 'keydown', { key });
    assert.deepEqual(reached, ['Tab', 'Escape', 'F5', 'F11']);

    // Space on the title opens it again, and the card is a Tab stop with its shortcuts back.
    assert.equal(press(host, traits.header, ' '), true);
    assert.equal(folded(traits.section), false);
    assert.equal(traits.section.getAttribute('tabindex'), '0');
    dispatch(traits.section, 'keydown', { key: 'Delete' });
    dispatch(traits.header, 'keydown', { key: 'Delete' });
    assert.deepEqual(acted, ['Delete', 'Delete'], 'open, Delete removes the row the user sees selected');
    reached.length = 0;
    dispatch(cards.Note.header, 'keydown', { key: 'ArrowDown' });
    assert.deepEqual(reached, ['ArrowDown'], 'an open card\'s title holds no key back but its own two');
});

test('a fold is the same for every record of the page, and only for that page', () => {
    const store = S.createStore({ storage: memoryStorage() });
    let current = 'armors';
    const first = pane();
    const sections = S.attach(first.host, { store, view: first.view, page: () => current, project: () => '/game' });
    sections.refresh();
    click(first.host, first.cards.Tactics.header);
    click(first.host, first.cards.Parameters.header);
    // Another armor: the page draws its cards again.
    const next = pane();
    const again = S.attach(next.host, { store, view: next.view, page: () => current, project: () => '/game' });
    again.refresh();
    assert.deepEqual(Object.keys(next.cards).filter(name => folded(next.cards[name].section)), ['Parameters', 'Tactics']);
    assert.equal(next.cards.Tactics.header.getAttribute('aria-expanded'), 'false');
    assert.deepEqual(next.events, [['Parameters', true], ['Tactics', true]], 'a card drawn folded is told so: its page stops what it had started to draw');
    // Weapons has cards of the same names: they are its own.
    current = 'weapons';
    const weapons = pane();
    S.attach(weapons.host, { store, view: weapons.view, page: () => current, project: () => '/game' }).refresh();
    assert.deepEqual(Object.keys(weapons.cards).filter(name => folded(weapons.cards[name].section)), []);
    // Another project too.
    current = 'armors';
    const other = pane();
    S.attach(other.host, { store, view: other.view, page: () => current, project: () => '/other' }).refresh();
    assert.deepEqual(Object.keys(other.cards).filter(name => folded(other.cards[name].section)), []);
});

test('a fold belongs to the page its card was drawn for', () => {
    const store = S.createStore({ storage: memoryStorage() });
    let current = 'armors';
    const { host, cards, view } = pane();
    const sections = S.attach(host, { store, view, page: () => current, project: () => '/game' });
    sections.refresh();
    // The shell names the next page before that page has drawn: a click in between is still the old page's.
    current = 'weapons';
    click(host, cards.Tactics.header);
    assert.equal(store.get('/game', 'armors', 'tactics'), true);
    assert.equal(store.get('/game', 'weapons', 'tactics'), undefined);
    // Cards kept on screen for the next page are that page's from its first pass on, and start as it starts.
    sections.refresh();
    assert.equal(sections.keyOfSection(cards.Tactics.section), 'tactics');
    assert.equal(folded(cards.Tactics.section), false, 'folded on Armors, never touched on Weapons');
    click(host, cards.Note.header);
    assert.equal(store.get('/game', 'weapons', 'note'), true);
    assert.equal(store.get('/game', 'armors', 'note'), undefined);
    current = 'armors';
    sections.refresh();
    assert.deepEqual(Object.keys(cards).filter(name => folded(cards[name].section)), ['Tactics'], 'back on Armors: as left there');
});

test('cards a page adds later are found, and the rows follow the width of the pane', () => {
    const { host, grid, cards, view } = pane();
    const watchers = {};
    const watcher = name => class {
        constructor(callback) { this.callback = callback; watchers[name] = this; }
        observe(target) { this.target = target; }
        disconnect() { this.target = null; }
        // A browser calls back only for what is being watched.
        deliver(records) { if (this.target) this.callback(records); }
    };
    view.MutationObserver = watcher('added');
    view.ResizeObserver = watcher('resized');
    let columns = '500px 500px', passes = 0;
    view.getComputedStyle = element => { if (element === grid) passes++; return { gridTemplateColumns: element === grid ? columns : '' }; };
    const store = S.createStore({ storage: memoryStorage() });
    store.set('/game', 'armors', 'drop-items', true);
    const sections = S.attach(host, { store, view, page: () => 'armors', project: () => '/game' });
    sections.refresh();
    assert.equal(watchers.added.target, host);
    assert.equal(watchers.resized.target, host);

    // The page redraws a list and adds a card: it is put as it was left without another pass being asked for.
    const late = card('Drop Items');
    grid.appendChild(late.section);
    watchers.added.deliver([{ addedNodes: [{ nodeType: 3 }, late.section] }]);
    assert.equal(late.header.getAttribute('aria-expanded'), 'false');
    assert.equal(folded(late.section), true);
    const inner = el('div'), nested = card('Rewards');
    inner.appendChild(nested.section);
    grid.appendChild(inner);
    watchers.added.deliver([{ addedNodes: [inner] }]);
    assert.equal(nested.header.getAttribute('aria-expanded'), 'true', 'a card inside what was added');
    const before = passes;
    watchers.added.deliver([{ addedNodes: [el('span'), el('canvas')] }, { addedNodes: [] }]);
    assert.equal(passes, before, 'anything else added costs no pass');
    inner.remove();
    late.section.remove();

    // Two columns: the card beside a folded one takes the row. One column: every card has its row already.
    click(host, cards.Tactics.header);
    assert.equal(cards.Traits.section.classList.contains('rr-section-solo'), true);
    columns = '1000px';
    watchers.resized.deliver([]);
    assert.equal(cards.Traits.section.classList.contains('rr-section-solo'), false, 'narrow: one column');
    assert.equal(cards.Tactics.section.classList.contains('rr-section-solo'), false);
    columns = '500px 500px';
    watchers.resized.deliver([]);
    assert.equal(cards.Traits.section.classList.contains('rr-section-solo'), true, 'wide again');

    // A card the page hides is no cell of a row: General | Parameters / [Traits hidden] Tactics | Note.
    cards.Traits.section.hidden = true;
    sections.layout();
    assert.equal(cards.Note.section.classList.contains('rr-section-solo'), true, 'Note now shares the folded card\'s row');
    assert.equal(cards.Parameters.section.classList.contains('rr-section-solo'), false);

    sections.dispose();
    assert.equal(watchers.added.target, null);
    assert.equal(watchers.resized.target, null);
});

test('a fold survives a change of the editor\'s language', () => {
    const store = S.createStore({ storage: memoryStorage() });
    const english = pane();
    S.attach(english.host, { store, view: english.view, page: () => 'armors', project: () => '/game', i18n: { _served: new Map() } }).refresh();
    click(english.host, english.cards.Parameters.header);
    const spanish = pane(['General', 'Parámetros', 'Rasgos', 'Tactics', 'Nota']);
    const served = new Map([['Parámetros', { text: 'Parameters' }], ['Rasgos', { text: 'Traits' }], ['Nota', { text: 'Note' }], ['General', { text: 'General' }]]);
    const sections = S.attach(spanish.host, { store, view: spanish.view, page: () => 'armors', project: () => '/game', i18n: { _served: served } });
    sections.refresh();
    assert.equal(folded(spanish.cards['Parámetros'].section), true);
    assert.equal(sections.keyOfSection(spanish.cards['Parámetros'].section), 'parameters');
    click(spanish.host, spanish.cards.Nota.header);
    assert.equal(store.get('/game', 'armors', 'note'), true, 'and a fold made in Spanish is kept under the English name');
});

test('the default is open, the Tactics card follows the project, and the user\'s choice wins', () => {
    const store = S.createStore({ storage: memoryStorage() });
    let onMapBattles = false;
    const defaults = (page, key) => (key === 'tactics' ? !onMapBattles : undefined);
    const classic = pane();
    const sections = S.attach(classic.host, { store, view: classic.view, page: () => 'armors', project: () => '/game', defaults });
    sections.refresh();
    assert.deepEqual(Object.keys(classic.cards).filter(name => folded(classic.cards[name].section)), ['Tactics'], 'a Classic project: only the Tactics card starts folded');
    assert.equal(classic.cards.Tactics.header.getAttribute('aria-expanded'), 'false');
    assert.equal(store.get('/game', 'armors', 'tactics'), undefined, 'a default is not a choice');
    // The game turns Tactical: the cards never touched open.
    onMapBattles = true;
    sections.refresh();
    assert.equal(folded(classic.cards.Tactics.section), false);
    assert.deepEqual(classic.events, [['Tactics', true], ['Tactics', false]], 'and the card is told, so its picture is drawn');
    // The user folds it by hand in a Tactical game: it stays folded.
    click(classic.host, classic.cards.Tactics.header);
    sections.refresh();
    assert.equal(folded(classic.cards.Tactics.section), true);
    // And opens it by hand in a Classic game: it stays open.
    onMapBattles = false;
    click(classic.host, classic.cards.Tactics.header);
    sections.refresh();
    assert.equal(folded(classic.cards.Tactics.section), false);
    const record = pane();
    S.attach(record.host, { store, view: record.view, page: () => 'armors', project: () => '/game', defaults }).refresh();
    assert.equal(folded(record.cards.Tactics.section), false);
});

test('the two battle cards each follow their own way of fighting, a record that uses one shows it, and the user\'s choice wins', () => {
    const store = S.createStore({ storage: memoryStorage() });
    let modes = { tactical: false, action: false };
    const defaults = (page, key, section) => S.battleCardFolded(key, section, () => modes);
    // A weapon's page: the cards of the page, then Tactical Battles and Action and First Person Battles.
    const weaponPage = (inUse = []) => {
        const page = pane(['General', 'Traits', 'Note']);
        const tactical = card('Tactical Battles', { key: 'tactics' }), action = card('Action and First Person Battles', { key: 'action' });
        tactical.section.setAttribute('data-section-default', 'tactical-battles');
        action.section.setAttribute('data-section-default', 'action-battles');
        for (const name of inUse) ({ tactical, action })[name].section.setAttribute('data-section-in-use', 'true');
        page.grid.append(tactical.section, action.section);
        const sections = S.attach(page.host, { store, view: page.view, page: () => 'weapons', project: () => '/game', defaults });
        sections.refresh();
        return { page, tactical, action, sections, state: () => [folded(tactical.section), folded(action.section)] };
    };
    const classic = weaponPage();
    assert.deepEqual(classic.state(), [true, true], 'Classic only: both folded');
    assert.deepEqual(Object.keys(classic.page.cards).filter(name => folded(classic.page.cards[name].section)), [], 'and nothing else is');
    modes = { tactical: true, action: false };
    classic.sections.refresh();
    assert.deepEqual(classic.state(), [false, true], 'a Tactical game: Tactical open, Action folded');
    modes = { tactical: false, action: true };
    classic.sections.refresh();
    assert.deepEqual(classic.state(), [true, false], 'an Action map in a Classic game: Action open, Tactical folded');
    modes = { tactical: true, action: true };
    classic.sections.refresh();
    assert.deepEqual(classic.state(), [false, false]);
    assert.equal(store.get('/game', 'weapons', 'tactics'), undefined, 'a default is not a choice');
    assert.equal(store.get('/game', 'weapons', 'action'), undefined);
    // A record with Action tags in a Classic game: its Action card is open, the Tactical one stays folded.
    modes = { tactical: false, action: false };
    assert.deepEqual(weaponPage(['action']).state(), [true, false]);
    assert.deepEqual(weaponPage(['tactical']).state(), [false, true]);
    assert.deepEqual(weaponPage(['tactical', 'action']).state(), [false, false]);
    // The user folds the Action card of a record that uses it: folded by hand, it stays folded, there and on every record.
    const used = weaponPage(['action']);
    click(used.page.host, used.action.header);
    assert.deepEqual(used.state(), [true, true]);
    assert.equal(store.get('/game', 'weapons', 'action'), true);
    assert.equal(store.get('/game', 'weapons', 'tactics'), undefined, 'each card is remembered by itself');
    assert.deepEqual(weaponPage(['action']).state(), [true, true]);
    modes = { tactical: true, action: true };
    assert.deepEqual(weaponPage().state(), [false, true], 'whatever the project fights');
    // And opened by hand in a Classic game, it stays open.
    modes = { tactical: false, action: false };
    const reopened = weaponPage();
    click(reopened.page.host, reopened.action.header);
    assert.deepEqual(weaponPage().state(), [true, false]);
});

test('a <details> card folds the same way and keeps what its page chose until the user chooses', () => {
    const { host, view, grid } = pane([]);
    const open = card('Action Sequences', { tag: 'details', open: true }), closed = card('Battler Motion', { tag: 'details', open: false });
    grid.append(open.section, closed.section);
    const store = S.createStore({ storage: memoryStorage() });
    const sections = S.attach(host, { store, view, page: () => 'skills', project: () => '/game' });
    sections.refresh();
    assert.equal(folded(open.section), false);
    assert.equal(folded(closed.section), true, 'the page drew it closed and nobody chose otherwise');
    assert.equal(closed.header.getAttribute('aria-expanded'), 'false');
    assert.equal(open.header.getAttribute('role'), null, 'a <summary> is a button already');
    assert.equal(click(host, open.header), true, 'the native toggle is held back: the fold is the one path');
    assert.equal(open.section.open, false);
    assert.equal(folded(open.section), true);
    assert.equal(store.get('/game', 'skills', 'action-sequences'), true);
    assert.equal(press(host, open.header, 'Enter'), true, 'the key is taken from the <summary> too: one path, one toggle');
    assert.equal(open.section.open, true);
    assert.equal(folded(open.section), false);
    assert.equal(store.get('/game', 'skills', 'action-sequences'), false);
    // The page opens a card by itself: classes and aria follow, nothing is remembered.
    closed.section.open = true;
    dispatch(closed.section, 'toggle', { bubbles: false });
    assert.equal(folded(closed.section), false);
    assert.equal(closed.header.getAttribute('aria-expanded'), 'true');
    assert.equal(store.get('/game', 'skills', 'battler-motion'), undefined);
});

test('the panes of a workspace and a card that opts out do not fold', () => {
    const host = el('div'), workspace = el('div', 'rr-ui-workspace'), battle = el('div', 'rr-battle-workspace');
    const layers = card('Layers'), steps = card('Action Steps'), off = card('Event Commands'), bare = el('div', 'database-section');
    off.section.setAttribute('data-section-fold', 'off');
    workspace.appendChild(layers.section); battle.appendChild(steps.section);
    host.append(workspace, battle, off.section, bare);
    const store = S.createStore({ storage: memoryStorage() });
    const sections = S.attach(host, { store, view: {}, page: () => 'userInterfaces', project: () => '/game' });
    assert.equal(sections.refresh(), 0);
    for (const item of [layers, steps, off]) {
        assert.equal(item.header.getAttribute('aria-expanded'), null);
        click(host, item.header);
        assert.equal(folded(item.section), false);
    }
});

test('a panel that is not a card opts in, and two sections of one name are told apart', () => {
    const host = el('div');
    const panel = el('section', 'rr-types-panel rr-db-fold'), body = el('div', 'rr-types-panel-body'), header = el('header', 'rr-types-panel-header rr-db-fold-header');
    panel.setAttribute('data-section-key', 'skillTypes');
    header.append(el('span', '', 'Skill Types'), el('span', 'rr-types-count', '4'));
    body.append(header, el('div', 'rr-types-list'));
    panel.appendChild(body);
    const first = card('Rewards'), second = card('Rewards');
    host.append(panel, first.section, second.section);
    const store = S.createStore({ storage: memoryStorage() });
    const sections = S.attach(host, { store, view: {}, page: () => 'types', project: () => '/game' });
    assert.equal(sections.refresh(), 3);
    assert.equal(S.headerOf(panel), header);
    click(host, header.children[1]);
    assert.equal(folded(panel), true);
    assert.equal(store.get('/game', 'types', 'skillTypes'), true);
    click(host, second.header);
    assert.equal(folded(first.section), false);
    assert.equal(store.get('/game', 'types', 'rewards~2'), true);
    // A title line marked on its own makes the group it heads a panel.
    const group = el('div'), groupHeader = el('div', 'rr-db-fold-header'), groupBody = el('div');
    groupHeader.setAttribute('data-section-key', 'flags');
    groupHeader.appendChild(el('h4', '', 'Flags'));
    group.append(groupHeader, groupBody);
    host.appendChild(group);
    assert.equal(sections.refresh(), 4);
    assert.equal(group.classList.contains('rr-db-fold'), true);
    click(host, groupHeader.children[0]);
    assert.equal(folded(group), true);
    assert.equal(store.get('/game', 'types', 'flags'), true);
    // The page redraws the panel's inside: the new header says the state again.
    const redrawn = el('header', 'rr-types-panel-header rr-db-fold-header');
    redrawn.append(el('span', '', 'Skill Types'));
    body.replaceChildren(redrawn, el('div', 'rr-types-list'));
    sections.refresh();
    assert.equal(redrawn.getAttribute('aria-expanded'), 'false');
    assert.equal(folded(panel), true);
});

//-----------------------------------------------------------------------------
// The shell and the pages.

function loadShell(globals) {
    const source = read('src/DatabaseEditorUI.js');
    return vm.runInNewContext(`${source}\nDatabaseEditorUI;`, Object.assign({ console: { log() {}, debug() {}, warn() {}, error() {} }, alert() {} }, globals));
}

test('the shell folds the Tactics card in a Classic project and opens it once the game fights on the map', async () => {
    const { host, grid, cards, view } = pane();
    // A battle card of another name says that it follows the same rule.
    const action = card('Action');
    action.section.setAttribute('data-section-default', 'map-battles');
    grid.appendChild(action.section);
    // The two cards of a weapon, a skill or an item say which way of fighting each is for.
    const tactical = card('Tactical Battles', { key: 'tactics' }), combat = card('Action and First Person Battles', { key: 'action' });
    tactical.section.setAttribute('data-section-default', 'tactical-battles');
    combat.section.setAttribute('data-section-default', 'action-battles');
    grid.append(tactical.section, combat.section);
    const store = S.createStore({ storage: memoryStorage() });
    let scanned, finish;
    const helper = Object.assign({}, S, {
        attach: (root, options) => S.attach(root, Object.assign({ store, view }, options)),
        createBattleScan: () => ({
            uses: () => (scanned ? scanned.tactical || scanned.action : scanned), modes: () => scanned,
            run: () => new Promise(resolve => { finish = modes => { scanned = modes; resolve(modes.tactical || modes.action); }; })
        })
    });
    const window = { RRDatabaseSections: helper, reactor: { eventManager: { currentMap: { note: '', events: [] } } } };
    const Shell = loadShell({ window, document: { getElementById: id => (id === 'database-detail' ? host : null) } });
    const ui = Object.create(Shell.prototype);
    const system = { reactorBattle: { mode: 'classic' } };
    ui.databaseManager = { getSystem: () => system, getTroops: () => [null, { pages: [] }], getCommonEvents: () => [null] };
    ui.currentProject = { path: '/game' };
    ui._databasePage = 'armors';
    const state = () => [folded(tactical.section), folded(combat.section)];
    assert.equal(ui.usesMapBattles(), false);
    assert.deepEqual(ui.battleModes(), { tactical: false, action: false });
    ui.refreshDatabaseSections();
    assert.equal(folded(cards.Tactics.section), true, 'Classic: folded');
    assert.equal(folded(action.section), true, 'and so is a card that asks for the same default');
    assert.deepEqual(state(), [true, true], 'Classic: both battle cards folded');
    assert.equal(folded(cards.Note.section), false);
    system.reactorBattle.mode = 'tactical';
    assert.equal(ui.usesMapBattles(), true);
    assert.deepEqual(ui.battleModes(), { tactical: true, action: false });
    ui.refreshDatabaseSections();
    assert.equal(folded(cards.Tactics.section), false, 'Tactical: open');
    assert.equal(folded(action.section), false);
    assert.deepEqual(state(), [false, true], 'a Tactical game: Tactical open, Action folded');
    system.reactorBattle.mode = 'firstPerson';
    ui.refreshDatabaseSections();
    assert.deepEqual(state(), [true, false], 'a First Person game: Action open, Tactical folded');
    // Classic in the Database, but a map file names a mode fought on the map: the cards open when
    // the reading of the map files ends, with no other pass asked for.
    system.reactorBattle.mode = 'classic';
    ui.refreshDatabaseSections();
    assert.equal(folded(cards.Tactics.section), true);
    ui.scanMapBattles();
    assert.equal(folded(cards.Tactics.section), true, 'while the files are read');
    finish({ tactical: false, action: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ui.usesMapBattles(), true);
    assert.deepEqual(ui.battleModes(), { tactical: false, action: true });
    assert.equal(folded(cards.Tactics.section), false);
    assert.equal(folded(action.section), false);
    assert.deepEqual(state(), [true, false], 'an Action map in a Classic game: Action open, Tactical folded');
    // The Database is opened again and the files now name Tactical too: news for the other card.
    ui._databaseSession = 2;
    ui.scanMapBattles();
    finish({ tactical: true, action: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(state(), [false, false]);
    assert.equal(ui._mapDataFolder(), '/game/data');
    assert.equal(store.get('/game', 'armors', 'tactics'), undefined, 'none of this was the user\'s choice');
    assert.equal(store.get('/game', 'armors', 'action'), undefined);
    // The open map names a mode the files have not said yet (it was just set and not saved).
    scanned = { tactical: false, action: false };
    window.reactor.eventManager.currentMap = { note: '<battle mode: tactical>', events: [] };
    ui.refreshDatabaseSections();
    assert.deepEqual(state(), [false, true]);
    // The files were read and named nothing; read again they name Action alone. That is news for the
    // Action card by itself: it opens when the reading ends, with no other pass asked for.
    window.reactor.eventManager.currentMap = { note: '', events: [] };
    ui.refreshDatabaseSections();
    assert.deepEqual(state(), [true, true]);
    ui._databaseSession = 3;
    ui.scanMapBattles();
    finish({ tactical: false, action: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(state(), [true, false], 'the Action answer of the scan alone changed');
    // And the other way: Tactical appears where only Action was.
    ui._databaseSession = 4;
    ui.scanMapBattles();
    finish({ tactical: true, action: false });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(state(), [false, true]);
    // A reading that finds what was already known asks for nothing.
    let passes = 0;
    const sections = ui.databaseSections(), refresh = sections.refresh;
    sections.refresh = (...args) => { passes++; return refresh(...args); };
    ui._databaseSession = 5;
    ui.scanMapBattles();
    finish({ tactical: true, action: false });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(passes, 0);
    sections.refresh = refresh;
});

test('the System pages write a card\'s name into its header', () => {
    // The pages' card helper runs with nothing but innerHTML, as their own tests run it.
    for (const [file, name] of [['src/database/DatabaseSystem1Editor.js', 'DatabaseSystem1Editor'], ['src/database/DatabaseSystem2Editor.js', 'DatabaseSystem2Editor']]) {
        const Editor = vm.runInNewContext(`${read(file)}\n${name};`, { console, window: {}, document: { createElement: () => ({ style: {}, className: '', innerHTML: '' }) } });
        const editor = Object.create(Editor.prototype);
        const keyed = editor.keyedSection('game-title', 'Título del juego', '<p>body</p>');
        assert.equal(keyed.className, 'database-section');
        assert.match(keyed.innerHTML, /<div class="database-section-header" data-section-key="game-title">Título del juego<\/div>\s*<div class="database-section-content">\s*<p>body<\/p>/, name);
        assert.match(editor.createSection('Plain', '').innerHTML, /<div class="database-section-header">Plain<\/div>/, 'a card made without a name has no empty attribute');
    }
    // And the shared code reads the name from there.
    const item = card('Título del juego');
    item.header.setAttribute('data-section-key', 'game-title');
    assert.equal(S.keyOf(item.section, item.header, null), 'game-title');
});

test('the Action Sequences card does not carry its state from one page to the next', () => {
    const { host } = pane();
    const seen = [];
    // The card keeps one open state for the whole session; it reads it when it is drawn.
    const presentation = { assignmentOpen: false, assignment(container, kind) { seen.push([kind, this.assignmentOpen]); this.assignmentOpen = true; } };
    const window = { RRDatabaseSections: null };
    const Shell = loadShell({ window, document: { getElementById: id => (id === 'database-detail' ? host : null) } });
    const ui = Object.create(Shell.prototype);
    Object.assign(ui, {
        databaseManager: { dataGeneration: 1 }, battlePresentationEditor: presentation, currentProject: { path: '/game' },
        cleanupDatabaseDetail() {}, wireLiveDatabaseNameSync() {},
        skillEditor: { showSkillDetail() {} }, weaponEditor: { showWeaponDetail() {} }, armorEditor: { showArmorDetail() {} }
    });
    ui.showDatabaseDetail({ id: 1 }, 'skills');
    ui.showDatabaseDetail({ id: 1 }, 'weapons');
    ui.showDatabaseDetail({ id: 2 }, 'weapons');
    ui.showDatabaseDetail({ id: 1 }, 'armors');
    assert.deepEqual(seen, [['skills', undefined], ['weapons', undefined], ['weapons', undefined]], 'each page draws the card by its own record');
});

test('every page the shell draws has its sections put back as they were left', () => {
    const shell = read('src/DatabaseEditorUI.js');
    const detail = shell.slice(shell.indexOf('    showDatabaseDetail(entry, type'), shell.indexOf('    get listIconTypes()'));
    assert.match(detail, /this\.refreshDatabaseSections\(\);\s*if \(window\.I18n\) window\.I18n\.applyText\(detailEl\);/, 'a record\'s page, before the label pass reads its titles back');
    for (const page of ['reactor3dEditor.show(detailEl)', 'system1Editor.showSystem1Detail(detailEl)', 'system2Editor.showSystem2Detail(detailEl)', 'controlsEditor?.showControlsDetail(detailEl)']) {
        const at = shell.indexOf(page);
        assert.ok(at > 0, page);
        assert.match(shell.slice(at, at + 160), /this\.refreshDatabaseSections\(\);\s*return;/, page);
    }
    for (const page of ['showTypesEditor() {', 'showTermsEditor() {']) {
        const from = shell.indexOf('    ' + page), body = shell.slice(from, shell.indexOf('\n    }\n', from));
        assert.match(body, /this\.refreshDatabaseSections\(\);\s*$/, page);
    }
    assert.match(shell, /this\._databasePage = type;[\s\S]*this\._databasePage = type;/, 'both ways a page opens name it');
    assert.match(shell, /class="rr-types-panel rr-db-fold" data-category="\$\{category\.key\}" data-section-key="\$\{category\.key\}"/);
    assert.equal((shell.match(/class="rr-terms-panel[^"]* rr-db-fold" data-section-key="/g) || []).length, 5, 'Basic Statuses, Parameters, Commands, Battles on the Map, Messages');
    // The walking sprite on the Actors page does not draw into a folded card.
    assert.match(shell, /if \(canvas\.closest\('\.database-section\.is-collapsed'\)\) return;\s*animate\(\);/);
});

test('the helper loads before the shell, and the Tactics card is a card like the others', () => {
    const html = read('index.html');
    const helper = html.indexOf('src/utils/DatabaseSections.js'), shell = html.indexOf('src/DatabaseEditorUI.js'), models = html.indexOf('src/database/Database3DEditor.js');
    assert.ok(helper > 0 && helper < shell && helper < models);
    const tactics = read('src/database/TacticsSection.js');
    assert.doesNotMatch(tactics, /createElement\('details'\)|<summary/, 'no <details> of its own: the shared fold drives it');
    // Each battle card names itself and says which way of fighting it is for; the names never change with the language.
    assert.match(tactics, /section\.dataset\.sectionKey = card\.key;/);
    assert.match(tactics, /section\.dataset\.sectionDefault = fightsFor\(name, kind\);/);
    const { CARDS, fightsFor } = require('../src/database/TacticsSection.js');
    assert.deepEqual(Object.values(CARDS).map(item => [item.key, item.fights]), [['sharedCombat', 'map-battles'], ['tactics', 'tactical-battles'], ['action', 'action-battles']]);
    // An actor's and an enemy's card holds what every battle on the map reads (how it fights, an enemy's picture): it is for all of them.
    assert.deepEqual(['weapon', 'skill', 'item', 'armor', 'state', 'class', 'actor', 'enemy'].map(kind => fightsFor('tactical', kind)),
        ['tactical-battles', 'tactical-battles', 'tactical-battles', 'tactical-battles', 'tactical-battles', 'tactical-battles', 'tactical-battles', 'tactical-battles']);
    assert.deepEqual(['weapon', 'skill', 'item'].map(kind => fightsFor('action', kind)), ['action-battles', 'action-battles', 'action-battles']);
    assert.match(read('src/DatabaseEditorUI.js'), /defaults: \(page, key, section\) => helper\.battleCardFolded\(key, section, \(\) => this\.battleModes\(\)\)/);
    assert.match(tactics, /if \(section\.classList\.contains\('is-collapsed'\)\) return;/, 'a folded card draws no picture');
    assert.match(tactics, /addEventListener\('rr-section-fold', event => \{ if \(event\.target === section && !event\.detail\.collapsed\) draw\(\); \}\)/, 'and draws it when it opens');
    assert.doesNotMatch(tactics, /section\.open/);
    // On Items the card stands in a column: as a grid cell it took a column's place.
    assert.match(read('src/database/DatabaseItemEditor.js'), /rightColumn\.append\(\.\.\.\[invocationSection, damageSection, effectsSection, tacticsSection\]\.filter\(Boolean\)\);/);
});

test('a preview that runs every frame stops while its card is folded', () => {
    const troops = read('src/database/DatabaseTroopEditor.js');
    assert.match(troops, /section\.addEventListener\('rr-section-fold', event => \{\s*if \(event\.target !== section\) return;\s*if \(event\.detail\.collapsed\) this\._roomPreviewCleanup\?\.\(\);\s*else this\.loadAndRenderCanvas\(\);/);
    assert.match(troops, /if\(roomMode && this\.canvas\?\.closest\('\.database-section\.is-collapsed'\)\)return;\s*if\(roomMode && this\.parentEditor\.battlePresentationEditor\)/, 'and none is started under a folded card');
    // The command list of a common event is the page itself.
    assert.match(read('src/database/DatabaseCommonEventEditor.js'), /section\.dataset\.sectionFold = 'off';/);
    // The two groups of the Tilesets side column fold like cards.
    const tilesets = read('src/database/DatabaseTilesetEditor.js');
    assert.match(tilesets, /<div class="rr-db-fold-header" data-section-key="layers"[^>]*>\s*<h3[^>]*>\$\{tt\('Tileset Layers'\)\}/);
    assert.match(tilesets, /<div class="rr-db-fold-header" data-section-key="flags"[^>]*>\s*<h4[^>]*>\$\{tt\('Flags'\)\}/);
});

test('the 3D Models page keeps its own sections in the same memory', () => {
    const models = read('src/database/Database3DEditor.js');
    assert.match(models, /this\._sectionsCollapsed\[name\] = this\._recalledSection\(name\);/);
    assert.equal((models.match(/this\.toggleSection\(name\);\s*this\._rememberSection\(name\);/g) || []).length, 2, 'the click and the keys');
    assert.match(models, /memory\.recall\(this\._project\(\)\?\.path \|\| '', 'reactor3d', name\)/);
    assert.match(models, /return folded === undefined \? name === 'stats' : folded;/, 'never touched: open, the cost card its one line');
    assert.match(models, /memory\?\.remember\(this\._project\(\)\?\.path \|\| '', 'reactor3d', name, !!this\._sectionsCollapsed\?\.\[name\]\)/);
});

//-----------------------------------------------------------------------------
// The stylesheet, as far as it can be asked without a layout engine: which
// declaration of a property wins for an element in a given state.

/** Every rule of the sheet as { selector, declarations: Map(property -> { value, important }), order }. */
function styleRules(css) {
    const rules = [];
    const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
    let order = 0;
    for (const [, selectors, body] of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const declarations = new Map();
        for (const part of body.split(';')) {
            const at = part.indexOf(':');
            if (at < 0) continue;
            const value = part.slice(at + 1).trim();
            declarations.set(part.slice(0, at).trim(), { value: value.replace(/\s*!important$/, '').replace(/\s+/g, ' '), important: /!important$/.test(value) });
        }
        for (const selector of selectors.split(/,(?![^()]*\))/)) rules.push({ selector: selector.trim(), declarations, order: order++ });
    }
    return rules;
}

/** Splits `a > b c` into [[' ', 'a'], ['>', 'b'], [' ', 'c']], leaving what is inside brackets alone. */
function selectorSteps(selector) {
    const steps = [];
    let depth = 0, current = '', combinator = ' ';
    const close = () => { if (current) steps.push([combinator, current]); current = ''; };
    for (const char of selector.trim().replace(/\s*>\s*/g, '>')) {
        if (char === '(' || char === '[') depth++;
        if (char === ')' || char === ']') depth--;
        if (depth === 0 && (char === ' ' || char === '>')) { close(); combinator = char; continue; }
        current += char;
    }
    close();
    return steps;
}

/**
 * Whether one compound (`div.a.b:has(>.c):not(:has(>.d))`, as selectorSteps
 * leaves it) matches the element: true, false, or null for a part this
 * reader does not know. The elements asked about have classes only: no id,
 * no attribute, no state such as hover.
 */
function matchesCompound(element, compound) {
    let rest = compound;
    const classes = element.className.split(/\s+/).filter(Boolean);
    while (rest) {
        let part;
        if ((part = /^\.([\w-]+)/.exec(rest))) {
            if (!classes.includes(part[1])) return false;
        } else if ((part = /^[a-z][\w-]*/i.exec(rest))) {
            if (element.tagName !== part[0].toUpperCase()) return false;
        } else if ((part = /^\*/.exec(rest))) {
            // any element
        } else if ((part = /^(?:#[\w-]+|\[[^\]]*\]|::[\w-]+|:(?:hover|focus|focus-visible|focus-within|active|disabled|checked|root)(?![\w-]))/.exec(rest))) {
            return false;
        } else if ((part = /^:has\(>([^()]+)\)/.exec(rest))) {
            const inner = matchesAny(element.children, part[1]);
            if (inner !== true) return inner;
        } else if ((part = /^:not\(:has\(>([^()]+)\)\)/.exec(rest))) {
            const inner = matchesAny(element.children, part[1]);
            if (inner !== false) return inner === null ? null : false;
        } else if ((part = /^:not\(\.([\w-]+)\)/.exec(rest))) {
            if (classes.includes(part[1])) return false;
        } else {
            return null;
        }
        rest = rest.slice(part[0].length);
    }
    return true;
}
function matchesAny(elements, compound) {
    let unknown = false;
    for (const element of elements) {
        const hit = matchesCompound(element, compound);
        if (hit) return true;
        if (hit === null) unknown = true;
    }
    return unknown ? null : false;
}

/** Whether a whole selector matches the element: true, false, or null where a part of it is not known here. */
function matchesSelector(element, selector) {
    const steps = selectorSteps(selector);
    const walk = (node, index) => {
        const [combinator, compound] = steps[index];
        const hit = matchesCompound(node, compound);
        if (hit !== true) return hit;
        if (index === 0) return true;
        if (combinator === '>') return node.parentNode && node.parentNode.tagName !== 'DOCUMENT' ? walk(node.parentNode, index - 1) : false;
        let unknown = false;
        for (let up = node.parentNode; up && up.className !== undefined; up = up.parentNode) {
            const above = walk(up, index - 1);
            if (above) return true;
            if (above === null) unknown = true;
        }
        return unknown ? null : false;
    };
    return steps.length ? walk(element, steps.length - 1) : false;
}

/** The value the sheet gives `property` on `element`: important first, then the more specific rule, then the later one. */
function styleOf(rules, element, property) {
    let best = null;
    for (const rule of rules) {
        const declared = rule.declarations.get(property);
        if (!declared) continue;
        const hit = matchesSelector(element, rule.selector);
        // A rule this reader cannot judge is passed over only where its last part does not name this element.
        if (hit === null) {
            const last = selectorSteps(rule.selector).pop()[1];
            const named = element.className.split(/\s+/).filter(Boolean).some(name => new RegExp('\\.' + name + '(?![\\w-])').test(last));
            assert.equal(named, false, `this test cannot read "${rule.selector}", which sets ${property} on an element it is asked about`);
            continue;
        }
        if (!hit) continue;
        const weight = [declared.important ? 1 : 0, (rule.selector.match(/\.[\w-]+|\[[^\]]+\]/g) || []).length, rule.order];
        if (!best || weight[0] > best.weight[0] || (weight[0] === best.weight[0] && (weight[1] > best.weight[1] || (weight[1] === best.weight[1] && weight[2] > best.weight[2])))) best = { weight, value: declared.value };
    }
    return best ? best.value : undefined;
}

test('Troops: a folded card is a bar whatever else is folded', () => {
    const rules = styleRules(read('css/styles.css'));
    const page = (previewFolded, eventsFolded) => {
        const editor = el('div', 'rr-troop-editor'), workspace = el('div', 'rr-troop-upper-workspace');
        const preview = el('div', 'database-section rr-troop-preview-section' + (previewFolded ? ' is-collapsed' : ''));
        const events = el('div', 'database-section rr-troop-events-section' + (eventsFolded ? ' is-collapsed' : ''));
        workspace.append(preview, el('div', 'rr-troop-sidebar'));
        editor.append(el('div'), workspace, events);
        return { workspace, preview, events };
    };
    // The workspace is a grid: grown to fill the page, it stretches its rows and the cards in them.
    assert.equal(styleOf(rules, page(false, false).workspace, 'flex'), '0 1 52%', 'nothing folded: its share of the page');
    const previewFolded = page(true, false);
    assert.equal(styleOf(rules, previewFolded.workspace, 'flex'), '0 1 auto', 'the preview folded: its own height, never grown; the event pages take the rest');
    assert.equal(styleOf(rules, previewFolded.workspace, 'max-height'), '52%', 'and no more of the page than the open preview had, so the event pages do not lose room to the fold');
    assert.equal(styleOf(rules, previewFolded.workspace, 'overflow-y'), 'auto');
    assert.equal(styleOf(rules, page(false, true).workspace, 'flex'), '1 1 auto', 'the event pages folded: the open preview takes the page');
    assert.equal(styleOf(rules, page(false, true).workspace, 'max-height'), 'none');
    const both = page(true, true);
    assert.equal(styleOf(rules, both.workspace, 'flex'), '0 1 auto', 'both folded: nothing grows, so the folded preview is not stretched');
    assert.equal(styleOf(rules, both.workspace, 'max-height'), 'none', 'and the cards may take the page');
    assert.equal(styleOf(rules, both.workspace, 'grid-template-columns'), 'minmax(0, 1fr)');
    assert.equal(styleOf(rules, both.preview, 'align-self'), 'start', 'and the bar keeps its own height in any row');
    for (const card of [both.preview, both.events, page(true, false).preview, page(false, true).events]) {
        assert.equal(styleOf(rules, card, 'flex'), '0 0 auto');
        assert.equal(styleOf(rules, card, 'height'), 'auto');
        assert.equal(styleOf(rules, card, 'min-height'), '0');
    }
});

test('the chevron stands at the start of the title in either reading direction, in the title\'s color', () => {
    const css = read('css/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const block = selector => { const at = css.indexOf(selector); assert.ok(at >= 0, selector); return css.slice(at, css.indexOf('}', at)); };
    const header = block('.database-section-header[aria-expanded],\n        .rr-db-fold-header[aria-expanded] {');
    assert.match(header, /padding-inline-start: 24px;/);
    assert.doesNotMatch(header, /padding-left/);
    assert.match(block('.rr-db-fold-header[aria-expanded] {\n            padding-inline-start'), /padding-inline-start: 24px !important;/, 'a panel\'s own inline padding does not hide it');
    const chevron = block('.database-section-header[aria-expanded]::before,\n        .rr-db-fold-header[aria-expanded]::before {');
    assert.match(chevron, /inset-inline-start: 9px;/);
    assert.doesNotMatch(chevron, /\bleft:/);
    assert.match(chevron, /color: inherit;/, 'an older marker rule of one card does not tint it');
    assert.match(css, /\[dir="rtl"\] \.database-section-header\[aria-expanded="false"\]::before,\s*\[dir="rtl"\] \.rr-db-fold-header\[aria-expanded="false"\]::before \{\s*transform: scaleX\(-1\);/, 'folded, it points the way the title reads');
    assert.match(css, /\[dir="rtl"\] \.database-section-header\[aria-expanded\] \{\s*border-left: 0;\s*border-right: 3px solid var\(--color-accent\);/);
    assert.match(css, /\.rr-tactics-header > \.rr-btn-chip \{\s*margin-block: -3px;/, 'the Tactics bar is as tall as the others');
});

test('a folded card is its header and nothing else', () => {
    const css = read('css/styles.css');
    assert.match(css, /\.database-section\.is-collapsed > :not\(\.database-section-header\),[^{]*\{\s*display: none !important;/);
    assert.match(css, /\.database-section\.is-collapsed > \.database-section-header \{\s*margin-bottom: 0;/);
    assert.match(css, /\.database-sections-grid > \.rr-section-solo,\s*\.database-actor-pair > \.rr-section-solo \{\s*grid-column: 1 \/ -1;/, 'the bar across the row');
    assert.match(css, /\.database-section-header\[aria-expanded\]::before,/, 'the chevron is drawn only on a header that folds');
    assert.doesNotMatch(css, /\.rr-tactics-section\[open\]|\.rr-tactics-section > summary/, 'the Tactics card has no fold of its own');
});
