const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(editorRoot, 'src', 'GlobalSearch.js');
const GS = require(sourcePath);

const message = (text, lines = []) => [
    { code: 101, indent: 0, parameters: ['Actor1', 0, 0, 2, 'Harold'] },
    { code: 401, indent: 0, parameters: [text] },
    ...lines.map(line => ({ code: 401, indent: 0, parameters: [line] }))
];
const end = { code: 0, indent: 0, parameters: [] };

const map = {
    events: [null,
        { id: 1, name: 'Innkeeper', note: '', x: 4, y: 7, pages: [
            { list: [...message('Welcome to the inn!', ['Rest for 10 gold?']), end] },
            { list: [{ code: 355, indent: 0, parameters: ['$gameParty.gainGold(5);'] },
                     { code: 655, indent: 0, parameters: ['console.log("dragonfruit")'] },
                     { code: 357, indent: 0, parameters: ['RR_Quest', 'start', 'Start quest', { questName: 'Lost Lantern' }] },
                     { code: 108, indent: 0, parameters: ['A comment about the cellar'] }, end] }
        ] },
        { id: 2, name: 'Potion Seller', note: '<shop>', x: 1, y: 1, pages: [{ list: [end] }] }
    ]
};

test('command text folds continuation lines into the command a person selects', () => {
    const rows = GS.commandTexts(map.events[1].pages[0].list);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].index, 0, 'a hit on a message line selects its Show Text');
    assert.match(rows[0].text, /Welcome to the inn! Rest for 10 gold\?/);
    const second = GS.commandTexts(map.events[1].pages[1].list);
    assert.deepEqual(second.map(r => r.index), [0, 2, 3]);
    assert.match(second[0].text, /dragonfruit/, 'script continuation joins its script');
    assert.match(second[1].text, /Lost Lantern/, 'plugin command arguments are searchable');
});

test('entries for every kind of project data, with their navigation targets', () => {
    const items = GS.databaseEntries('items', [null, { id: 1, name: 'Potion', note: 'heals <hp:50>' }, { id: 7, name: 'Ether', note: '' }], 'Items');
    assert.deepEqual(items[0].target, { kind: 'database', type: 'items', id: 1 });
    assert.equal(items[1].i, '7');

    const ce = GS.databaseEntries('commonEvents', [null, { id: 3, name: 'Shop', list: [...message('Buy something?'), end] }], 'Common Events');
    assert.deepEqual(ce.map(e => e.group), ['db:commonEvents', 'commonEventCommands']);
    assert.deepEqual(ce[1].target, { kind: 'commonEvent', id: 3, command: 0 });

    const ev = GS.mapEventEntries(5, 'Town', map);
    const lantern = ev.find(e => e.c.includes('lost lantern'));
    assert.deepEqual(lantern.target, { kind: 'mapEvent', mapId: 5, eventId: 1, page: 1, command: 2 });
    assert.deepEqual(ev.find(e => e.title === 'Potion Seller').target, { kind: 'mapEvent', mapId: 5, eventId: 2 });

    const sys = GS.systemEntries({ switches: ['', 'Door Open', ''], variables: ['', '', 'Gold Count'] });
    assert.deepEqual(sys.map(e => [e.group, e.title, e.target.kind, e.target.id]),
        [['switches', 'Door Open', 'switch', 1], ['variables', 'Gold Count', 'variable', 2]]);

    const maps = GS.mapEntries([null, { id: 1, name: 'Overworld' }, null, { id: 3, name: '' }]);
    assert.deepEqual(maps.map(e => e.title), ['Overworld', 'MAP003']);
    assert.deepEqual(GS.pluginEntries([{ name: 'RR_Quest', description: 'Quests' }])[0].target, { kind: 'plugin', name: 'RR_Quest', index: 0 });
});

test('every Database type is a group of its own, labelled as its list numbers it', () => {
    const data = {
        actors: [null, { id: 9, name: 'Rhea Voss', note: '' }],
        skills: [null, { id: 3, name: 'Fireball' }],
        states: [null, { id: 4, name: 'Poison' }],
        vehicles: [null, { id: 1, name: 'Motorcycle' }],
        actionSequences: [null, { id: 2, name: 'Melee Strike', note: '' }],
        userInterfaces: [null, { id: 1, name: 'Title Screen' }],
        quests: [null, { id: 5, name: 'Lost Lantern' }],
        structures: [null, { id: 7, name: 'Chapel' }],
        system: { reactorMusicSequences: [null, { id: 1, name: 'Battle Theme' }] }
    };
    const entries = [];
    for (const [type, label] of GS.DATABASE_TYPES) entries.push(...GS.databaseEntries(type, GS.databaseRecords(type, data), label));
    const groups = new Set(entries.map(e => e.group));
    for (const type of ['actors', 'skills', 'states', 'vehicles', 'actionSequences', 'userInterfaces', 'quests', 'structures', 'musicSequences']) {
        assert.ok(groups.has(`db:${type}`), type);
    }
    const rhea = entries.find(e => e.title === 'Rhea Voss');
    assert.equal(rhea.label, '0009: Rhea Voss');
    assert.equal(rhea.groupLabel, 'Actors');
    assert.deepEqual(rhea.target, { kind: 'database', type: 'actors', id: 9 });
    // The stock vehicles are listed first and carry no number; their IDs are the page's own.
    const boat = entries.find(e => e.title === 'Boat');
    assert.equal(boat.label, 'Boat');
    assert.deepEqual(boat.target, { kind: 'database', type: 'vehicles', id: -3 });
    assert.equal(entries.find(e => e.title === 'Battle Theme').target.type, 'musicSequences');
    // Reading the records never creates the music list.
    assert.deepEqual(GS.databaseRecords('musicSequences', { system: {} }), []);

    const hits = GS.search(entries, 'melee');
    assert.equal(hits[0].entry.group, 'db:actionSequences');
    const grouped = GS.groupResults(GS.search(entries, 'o'), 8);
    assert.ok(grouped.every(group => group.label), 'each group carries its header');

    // An editor name matches like the game name and shows beside it.
    const named = GS.databaseEntries('skills', [null, { id: 3, name: 'Fireball' }], 'Skills', id => (id === 3 ? 'Fire L1' : ''));
    assert.equal(named[0].label, '0003: Fireball (Fire L1)');
    assert.equal(GS.search(named, 'fire l1')[0].entry.title, 'Fireball');
});

test('3D models are listed by name and folder and go to the model', () => {
    const models = GS.modelEntries([{ name: 'Vehicles/Tank' }, { name: 'Lantern' }], '3D Models');
    assert.deepEqual(models.map(e => [e.group, e.title, e.sub, e.target.name]),
        [['db:reactor3d', 'Tank', 'Vehicles', 'Vehicles/Tank'], ['db:reactor3d', 'Lantern', '', 'Lantern']]);
    assert.equal(GS.search(models, 'vehicles/ta')[0].entry.title, 'Tank');
});

test('ranking: name hits above ID hits above content hits; case-insensitive', () => {
    const entries = [
        ...GS.databaseEntries('items', [null, { id: 1, name: 'Potion', note: '' }, { id: 2, name: 'High Potion', note: '' }, { id: 3, name: 'Ether', note: 'better than a potion' }], 'Items'),
        ...GS.mapEventEntries(1, 'Town', map)
    ];
    const hits = GS.search(entries, 'POTION');
    const names = hits.map(h => h.entry.title);
    assert.equal(names[0], 'Potion', 'exact name first');
    assert.ok(names.indexOf('Potion Seller') < names.indexOf('High Potion'), 'name prefix above a later word');
    assert.equal(hits[hits.length - 1].entry.title, 'Ether', 'a note hit is last');

    const byId = GS.search(entries, '#3');
    assert.equal(byId[0].entry.title, 'Ether');
    assert.equal(GS.search(entries, 'cellar')[0].entry.group, 'mapEventCommands');
    assert.equal(GS.search(entries, 'inn rest').length, 1, 'all words must appear');
    assert.equal(GS.search(entries, '').length, 0);
});

test('grouping keeps group order by best hit and caps each group', () => {
    const entries = GS.databaseEntries('items', Array.from({ length: 30 }, (_, i) => i ? { id: i, name: `Herb ${i}` } : null), 'Items')
        .concat(GS.systemEntries({ switches: ['', 'Herb'], variables: [] }));
    const groups = GS.groupResults(GS.search(entries, 'herb'), 5);
    assert.equal(groups[0].key, 'switches', 'the exact hit leads its group to the top');
    assert.equal(groups[1].key, 'db:items');
    assert.equal(groups[1].hits.length, 5);
    assert.equal(groups[1].total, 29);
});

test('the index rebuilds only stale groups and narrows a growing query', () => {
    const index = new GS.SearchIndex();
    let builds = 0;
    let names = ['Potion', 'Ether'];
    index.define('db:items', () => { builds++; return GS.databaseEntries('items', [null, ...names.map((name, i) => ({ id: i + 1, name }))], 'Items'); });
    index.set('map:1', GS.mapEventEntries(1, 'Town', map));
    index.refresh();
    index.refresh();
    assert.equal(builds, 1, 'a fresh group is not rebuilt');
    assert.equal(index.search('po').length, 2);
    // A narrowing search looks only at the previous matches.
    const pool = index._last.hits.length;
    assert.equal(index.search('pot').length, 2);
    assert.ok(index._last.hits.length <= pool);
    names = ['Elixir', 'Ether'];
    index.invalidate('db:items');
    index.refresh();
    assert.equal(builds, 2);
    assert.equal(index.search('potion').length, 1, 'after a rebuild the old matches are not reused');
    assert.equal(index.search('elixir')[0].entry.title, 'Elixir');
    index.remove('map:1');
    assert.equal(index.search('innkeeper').length, 0);
});

test('index and search speed on a large project', () => {
    const bigMap = { events: [null] };
    for (let id = 1; id <= 400; id++) {
        bigMap.events.push({ id, name: `NPC ${id}`, x: 0, y: 0, pages: [{ list: [...message(`Line ${id} of the story`, ['more text', 'and more']), end] }] });
    }
    const index = new GS.SearchIndex();
    for (let m = 1; m <= 50; m++) index.set(`map:${m}`, GS.mapEventEntries(m, `Map ${m}`, bigMap));
    const t0 = performance.now();
    index.search('story');
    const t1 = performance.now();
    index.search('story of');
    const t2 = performance.now();
    assert.ok(index.size >= 40000);
    assert.ok(t1 - t0 < 250, `full search took ${t1 - t0}ms`);
    assert.ok(t2 - t1 < 250, `narrowed search took ${t2 - t1}ms`);
});

/** The editor half, in a context with stand-ins for the window and the editor's managers. */
function editorContext() {
    const listeners = {};
    const rows = {};
    const doc = {
        readyState: 'complete',
        addEventListener() {}, getElementById: id => doc.elements[id] || null,
        querySelector: selector => rows[selector] || null, querySelectorAll: () => [], elements: {}
    };
    const ctx = { console, setTimeout, clearTimeout, performance, document: doc, rrEscapeHtml: s => String(s) };
    ctx.window = ctx;
    ctx.addEventListener = (name, fn) => { (listeners[name] ||= []).push(fn); };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(sourcePath, 'utf8'), ctx, { filename: sourcePath });
    return { ctx, doc, rows, listeners };
}

test('navigation: each kind of result goes where the editor already opens it', async () => {
    const { ctx, doc, rows } = editorContext();
    const calls = [];
    const row = () => ({ scrollIntoView() {}, getBoundingClientRect: () => ({ height: 20 }), classList: { add() {}, remove() {} }, isConnected: true });
    const eventEditor = {
        open: false, currentPageIndex: 0, sourceEvent: null,
        isOpen() { return this.open; },
        switchToPage(i) { calls.push(['page', i]); this.currentPageIndex = i; },
        renderCurrentPage() { calls.push(['render']); },
        commandList: { selectSingle(i) { calls.push(['selectCommand', i]); } }
    };
    const em = {
        currentMap: { id: 4, events: map.events },
        eventEditor,
        selectEventFromList(id) { calls.push(['selectEvent', id]); },
        editEvent(event) { calls.push(['editEvent', event.id]); eventEditor.open = true; eventEditor.sourceEvent = event; }
    };
    const commonEditor = { currentEvent: { id: 3 }, selectedCommandIndices: [], renderCommandList() { calls.push(['renderCommon']); } };
    const app = {
        openDatabase(type, options) { calls.push(['openDatabase', type, options && options.select]); },
        databaseEditorUI: { commonEventEditor: commonEditor },
        forgeManager: { openTool(id) { calls.push(['forge', id]); } },
        pluginManager: { plugins: [{ name: 'A' }, { name: 'RR_Quest' }], selectPluginFromEvent(i) { calls.push(['plugin', i]); } },
        showPluginManager() { calls.push(['showPlugins']); },
        optionsManager: { show() { calls.push(['options']); } }
    };
    const search = {
        app: () => app, eventManager: () => em, db: () => ({}), pc: () => ({}),
        openMap: async id => { calls.push(['loadMap', id]); return true; }
    };
    ctx.SwitchVariablePicker = class { show(type, id) { calls.push(['picker', type, id]); } };
    const navigate = ctx.RRGlobalSearch.navigate;

    await navigate(search, { kind: 'database', type: 'items', id: 7 });
    assert.deepEqual(calls.pop(), ['openDatabase', 'items', 7]);

    await navigate(search, { kind: 'map', mapId: 9 });
    assert.deepEqual(calls.pop(), ['loadMap', 9]);

    calls.length = 0;
    await navigate(search, { kind: 'mapEvent', mapId: 4, eventId: 2 });
    assert.deepEqual(calls, [['loadMap', 4], ['selectEvent', 2]]);

    calls.length = 0;
    rows['.command-list-container .command-item[data-index="2"]'] = row();
    await navigate(search, { kind: 'mapEvent', mapId: 4, eventId: 1, page: 1, command: 2 });
    assert.deepEqual(calls, [['loadMap', 4], ['selectEvent', 1], ['editEvent', 1], ['page', 1], ['selectCommand', 2], ['render']]);

    calls.length = 0;
    const list = { querySelector: () => row(), focus() {} };
    doc.elements['common-event-command-list'] = list;
    rows['#common-event-command-list [data-cmd-index="5"]'] = row();
    await navigate(search, { kind: 'commonEvent', id: 3, command: 5 });
    assert.deepEqual(calls, [['openDatabase', 'commonEvents', 3], ['renderCommon']]);
    assert.deepEqual([...commonEditor.selectedCommandIndices], [5]);

    calls.length = 0;
    await navigate(search, { kind: 'switch', id: 12 });
    await navigate(search, { kind: 'variable', id: 3 });
    await navigate(search, { kind: 'plugin', name: 'RR_Quest' });
    await navigate(search, { kind: 'forge', id: 'prop-builder' });
    await navigate(search, { kind: 'databasePage', type: 'system1' });
    assert.deepEqual(calls, [['picker', 'switch', 12], ['picker', 'variable', 3], ['showPlugins'], ['plugin', 1],
        ['forge', 'prop-builder'], ['openDatabase', 'system1', undefined]]);

    // A 3D model: the page is told the model, then opened.
    calls.length = 0;
    const r3d = { selectedName: '', _detail: { querySelector: () => row() }, listModels: () => [{ name: 'Vehicles/Tank' }], selectModel(entry) { calls.push(['selectModel', entry.name]); this.selectedName = entry.name; } };
    app.databaseEditorUI.reactor3dEditor = r3d;
    rows['.r3d-model-list [data-model="Vehicles/Tank"]'] = row();
    assert.equal(await navigate(search, { kind: 'model', name: 'Vehicles/Tank' }), true);
    assert.deepEqual(calls, [['openDatabase', 'reactor3d', undefined]]);
    assert.equal(r3d.selectedName, 'Vehicles/Tank');

    let clicked = 0;
    await navigate(search, { kind: 'element', element: { isConnected: true, click() { clicked++; } } });
    assert.equal(clicked, 1, 'a menu command runs as if its menu row were clicked');
});

test('the editor registers the module, the button and its strings in every locale', () => {
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    assert.match(html, /<script src="src\/GlobalSearch\.js"><\/script>/);
    assert.match(html, /id="global-search-btn"[\s\S]*?<svg viewBox="0 0 64 64"/);
    const i18n = fs.readFileSync(path.join(editorRoot, 'src', 'I18nManager.js'), 'utf8');
    const locales = ['en', 'ja', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'pl', 'tr', 'ko', 'zh-Hans', 'zh-Hant', 'ar', 'el', 'id', 'th', 'vi'];
    const source = fs.readFileSync(sourcePath, 'utf8');
    const used = [...new Set([...source.matchAll(/ts\('([a-zA-Z]+)'/g)].map(m => m[1]))];
    for (const key of ['menuCommands', 'dbPages', 'maps', 'mapEvents', 'eventContents', 'switches', 'variables', 'plugins']) used.push(key);
    for (const locale of locales) {
        const line = i18n.split('\n').find(l => l.startsWith(`Object.assign(RR_I18N_STRINGS['${locale}'], {"globalSearch.`));
        assert.ok(line, `globalSearch strings for ${locale}`);
        const table = JSON.parse(line.slice(line.indexOf('{'), line.lastIndexOf('}') + 1));
        for (const key of used) assert.ok(table[`globalSearch.${key}`], `${locale} globalSearch.${key}`);
    }
});
