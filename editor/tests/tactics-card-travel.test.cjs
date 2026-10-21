'use strict';
// A record's battle settings (`rrBattle`, what the Database's battle cards
// store) go wherever the record goes: saved and loaded with its file, copied,
// cut, pasted (into this project or another editor's), duplicated; gone with
// a cleared record and with one a smaller maximum removed; taken back by the
// Database's Cancel and by the list's Undo. The real DatabaseManager and the
// real list code of DatabaseEditorUI, on a project in a temp folder.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const T = require(path.join(editorRoot, 'src', 'database', 'TacticsSection.js'));
const RRJson = require(path.join(editorRoot, 'src', 'utils', 'JsonFiles.js'));
const editorNames = require(path.join(editorRoot, 'src', 'utils', 'EditorNames.js'));

const quiet = Object.create(console);
quiet.error = () => {}; quiet.warn = () => {}; quiet.log = () => {}; quiet.debug = () => {};
const plain = value => JSON.parse(JSON.stringify(value === undefined ? null : value));

function loadDatabaseManager() {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseManager.js'), 'utf8');
    return vm.runInNewContext(`${source}\nDatabaseManager;`, { RRJson, console: quiet, process, require, nw: {}, RREditorNames: editorNames });
}

/** The list code, with a clipboard two editors share: what one writes the other reads, as text. */
function loadDatabaseEditorUI(shared) {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    const ReactorClipboard = shared ? {
        write: async (type, payload) => { shared.text = JSON.stringify({ type, payload }); return true; },
        read: async type => { const held = shared.text ? JSON.parse(shared.text) : null; return held && held.type === type ? { payload: held.payload } : null; }
    } : undefined;
    return vm.runInNewContext(`${source}\nDatabaseEditorUI;`, Object.assign({ console: quiet, RREditorNames: editorNames, alert() {}, confirm: () => true, RRDialog: { alert() {}, confirm: async () => true } }, shared ? { ReactorClipboard } : null));
}

const BASE = {
    Actors: { name: 'Ren', classId: 1, characterName: 'Actor1', characterIndex: 0, traits: [], equips: [0, 0, 0, 0, 0], note: '' },
    Classes: { name: 'Soldier', traits: [], learnings: [], params: [], note: '' },
    Skills: { name: 'Fire', scope: 1, hitType: 2, effects: [], damage: { type: 1 }, note: 'Burns.' },
    Items: { name: 'Grenade', scope: 2, effects: [], damage: { type: 1 }, note: '' },
    Weapons: { name: 'Carbine', wtypeId: 2, traits: [], params: [0, 0, 0, 0, 0, 0, 0, 0], note: '' },
    Armors: { name: 'Plate', atypeId: 1, traits: [], params: [0, 0, 0, 0, 0, 0, 0, 0], note: '' },
    Enemies: { name: 'Wolf', battlerName: 'Wolf', traits: [], actions: [], dropItems: [], params: [1, 0, 1, 1, 1, 1, 1, 1], note: '' },
    States: { name: 'Slowed', traits: [], note: '' }
};
// What each kind of record sets in its cards.
const SETTINGS = {
    actor: { move: 6, jump: 2, ai: 'support' }, class: { move: 5, jump: 1 },
    skill: { range: { min: 2, max: 6 }, area: { shape: 'cone', size: 3 }, los: false, cooldown: 6.5 },
    item: { range: { min: 0, max: 4 }, area: { shape: 'circle', size: 1 }, cooldown: 3 },
    weapon: { range: { min: 1, max: 5 }, move: -1, fireRate: 6, magazine: 24, reload: 1.8, spread: 3, projectile: 'bolt' },
    armor: { move: 1, jump: -1 }, enemy: { move: 3, ai: 'ranged', character: { name: 'Monster', index: 3 } }, state: { move: -2 }
};
const fileOf = kind => Object.keys(T.FILES).find(name => T.FILES[name] === kind);

async function openProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-tactics-travel-'));
    fs.mkdirSync(path.join(root, 'data'));
    for (const [name, record] of Object.entries(BASE)) {
        const list = [null, Object.assign({ id: 1 }, record), Object.assign({ id: 2 }, record, { name: record.name + ' II' }), Object.assign({ id: 3 }, record, { name: record.name + ' III' })];
        fs.writeFileSync(path.join(root, 'data', name + '.json'), RRJson.stringify(list));
    }
    fs.writeFileSync(path.join(root, 'data', 'System.json'), JSON.stringify({ gameTitle: 'Travel', weaponTypes: ['', 'Sword', 'Rifle'], versionId: 1 }));
    const DatabaseManager = loadDatabaseManager();
    const manager = new DatabaseManager();
    manager.fs = fs; manager.path = path;
    assert.equal(await manager.loadAllData(root), true);
    return { root, manager, DatabaseManager, text: name => fs.readFileSync(path.join(root, 'data', name), 'utf8') };
}

/** The Database's list code on a manager, as the editor wires it; what it shows and says is not looked at. */
function listUI(manager, root, shared) {
    const DatabaseEditorUI = loadDatabaseEditorUI(shared);
    const ui = Object.create(DatabaseEditorUI.prototype);
    Object.assign(ui, { callbacks: {}, databaseManager: manager, currentProject: { name: path.basename(root), path: root }, _listGeneration: 1 });
    ui._t = key => (key === 'common.unnamed' ? 'Unnamed' : key);
    ui.updateStatus = () => {};
    ui.showDatabaseDetail = () => {};
    ui.cleanupDatabaseDetail = () => {};
    ui._selectEntryMarkup = () => '';
    ui._snapshotForUndo = () => {};
    return ui;
}

/** A card's change kept as the cards keep it: a new `rrBattle` on the record the Database holds, and the Database told. */
function set(manager, kind, id, card, values) {
    const key = T.DATA_KEYS[kind], record = manager.data[key][id], context = { weaponTypes: manager.getSystem().weaponTypes, classOf: classId => manager.getClass(classId) };
    T.put(record, T.change(card, kind, record, context, values));
    manager['update' + kind[0].toUpperCase() + kind.slice(1)](id, record);
    return record;
}
const setAll = (manager, kind, id) => { for (const card of T.cardsFor(kind)) set(manager, kind, id, card, SETTINGS[kind]); return manager.data[T.DATA_KEYS[kind]][id]; };

test.after(() => { for (const name of fs.readdirSync(os.tmpdir())) if (name.startsWith('rr-tactics-travel-')) fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true }); });

test('the Database keeps each kind of record where the cards look for it, and saves and loads its settings with its file', async () => {
    const { root, manager, DatabaseManager, text } = await openProject();
    assert.equal(manager.projectPath, root, 'where the cards find the project\'s pictures');
    for (const kind of T.KINDS) {
        const key = T.DATA_KEYS[kind], updater = 'update' + kind[0].toUpperCase() + kind.slice(1);
        assert.ok(Array.isArray(manager.data[key]) && manager.data[key][1].name === BASE[fileOf(kind).replace('.json', '')].name, `${kind}: data.${key}`);
        assert.equal(typeof manager[updater], 'function', updater);
    }
    assert.deepEqual([...manager.getDirtyKeys()], [], 'opening changes nothing');
    const before = {};
    for (const kind of T.KINDS) before[kind] = text(fileOf(kind));
    for (const kind of T.KINDS) {
        const told = manager.mutationGeneration, record = setAll(manager, kind, 2);
        assert.deepEqual(record.rrBattle, SETTINGS[kind], kind);
        assert.ok(manager.mutationGeneration > told, kind + ': the Database was told');
        assert.ok(manager.getDirtyKeys().includes(T.DATA_KEYS[kind]), kind + ': unsaved work');
        assert.equal(text(fileOf(kind)), before[kind], kind + ': nothing is written before OK or Apply');
    }
    assert.equal(await manager.saveAllData(root), true);
    assert.deepEqual([...manager.getDirtyKeys()], []);
    for (const kind of T.KINDS) {
        const lines = text(fileOf(kind)).split('\n'), was = before[kind].split('\n');
        // A file is `[`, `null,`, then a record a line.
        assert.deepEqual(JSON.parse(lines[3].replace(/,$/, '')).rrBattle, SETTINGS[kind], kind + ': in its file, on the record\'s own line');
        assert.deepEqual([lines.length, lines[0], lines[1], lines[2], lines[4], lines[5]], [was.length, was[0], was[1], was[2], was[4], was[5]], kind + ': the other records\' lines are as they were');
        assert.equal('rrBattle' in JSON.parse(lines[2].replace(/,$/, '')), false);
    }
    // Another start of the editor reads them back, and the cards show them.
    const again = new DatabaseManager();
    again.fs = fs; again.path = path;
    assert.equal(await again.loadAllData(root), true);
    for (const kind of T.KINDS) {
        const record = again.data[T.DATA_KEYS[kind]][2];
        assert.deepEqual(plain(record.rrBattle), SETTINGS[kind], kind);
        assert.deepEqual(plain(T.own(record)), SETTINGS[kind], kind + ': every key is one the game takes');
        for (const card of T.cardsFor(kind)) assert.equal(T.summarize(card, kind, record, { weaponTypes: ['', 'Sword', 'Rifle'], classOf: id => again.getClass(id) }).tagged, true, `${kind}, ${card}: the card says the record sets something`);
    }
    // Set back to Automatic and saved, the key is gone from the file.
    for (const kind of T.KINDS) for (const card of T.cardsFor(kind)) { const record = again.data[T.DATA_KEYS[kind]][2]; T.put(record, T.reset(card, kind, record)); }
    assert.equal(await again.saveAllData(root), true);
    for (const kind of T.KINDS) assert.equal(text(fileOf(kind)), before[kind], kind + ': the file is byte for byte what it was before the settings');
});

test('copy, cut, paste and duplicate take a record\'s settings along, each record with an object of its own', async () => {
    const { root, manager } = await openProject();
    const ui = listUI(manager, root);
    for (const kind of T.KINDS) {
        const key = T.DATA_KEYS[kind], list = manager.data[key], visible = () => list.filter(Boolean);
        const source = setAll(manager, kind, 1);
        ui.copyListEntries([list[1]], key);
        assert.deepEqual(plain(ui.listClipboard.entries[0].rrBattle), SETTINGS[kind], kind + ': the copy');
        // The copy is its own: the source changed afterward does not change what was copied.
        for (const card of T.cardsFor(kind)) set(manager, kind, 1, card, { move: 9, range: { min: 1, max: 9 } });
        assert.deepEqual(plain(ui.listClipboard.entries[0].rrBattle), SETTINGS[kind], kind);
        T.put(source, { note: source.note, rrBattle: Object.assign({}, SETTINGS[kind]) });
        await ui.pasteListEntries(list[2], visible(), key, () => {}, { value: '' }, {});
        assert.deepEqual(plain(list[2].rrBattle), SETTINGS[kind], kind + ': the paste');
        assert.equal(list[2].id, 2);
        assert.ok(list[2].rrBattle !== source.rrBattle && list[2].rrBattle !== ui.listClipboard.entries[0].rrBattle, kind + ': an object of its own');
        // Pasted twice, the two records share nothing either.
        await ui.pasteListEntries(list[3], visible(), key, () => {}, { value: '' }, {});
        assert.ok(list[3].rrBattle !== list[2].rrBattle);
        for (const card of T.cardsFor(kind)) set(manager, kind, 3, card, { move: null, jump: null, range: null, area: null, los: null, ai: null, character: null });
        assert.deepEqual(plain(list[2].rrBattle), SETTINGS[kind], kind + ': a change to one pasted record leaves the other');
        ui.duplicateListEntry(list[1], visible(), key, () => {}, { value: '' });
        const copy = list[list.length - 1];
        assert.deepEqual([copy.id, plain(copy.rrBattle)], [4, SETTINGS[kind]], kind + ': the duplicate');
        assert.ok(copy.rrBattle !== source.rrBattle);
        // A record that sets nothing pastes clean over one that did.
        const bare = Object.assign({}, list[1]);
        delete bare.rrBattle;
        list[1] = bare;
        ui.copyListEntries([list[1]], key);
        await ui.pasteListEntries(list[2], visible(), key, () => {}, { value: '' }, {});
        assert.equal('rrBattle' in list[2], false, kind + ': nothing set, nothing pasted');
        // Cut: the settings leave with the record and arrive where it is pasted.
        ui.getDefaultTemplates = () => ({ [key]: { name: 'New', note: '' } });
        ui.setEditorName = () => {};
        await ui.cutListEntries([list[4]], visible(), key, () => {}, { value: '' }, {});
        assert.deepEqual(['rrBattle' in list[4], list[4].name], [false, ''], kind + ': the cut record is a blank one');
        await ui.pasteListEntries(list[3], visible(), key, () => {}, { value: '' }, {});
        assert.deepEqual(plain(list[3].rrBattle), SETTINGS[kind], kind + ': and its settings are where it was pasted');
        delete ui.getDefaultTemplates;
        delete ui.setEditorName;
    }
});

test('a record copied in one editor and pasted in another project brings its settings', async () => {
    const shared = { text: '' };
    const from = await openProject(), to = await openProject();
    const left = listUI(from.manager, from.root, shared), right = listUI(to.manager, to.root, shared);
    for (const kind of T.KINDS) {
        const key = T.DATA_KEYS[kind];
        setAll(from.manager, kind, 1);
        left.copyListEntries([from.manager.data[key][1]], key);
        await left.listClipboard._writePromise;
        assert.deepEqual(JSON.parse(shared.text).payload.entries[0].rrBattle, SETTINGS[kind], kind + ': what leaves the editor');
        await right.pasteListEntries(to.manager.data[key][3], to.manager.data[key].filter(Boolean), key, () => {}, { value: '' }, {});
        assert.deepEqual(plain(to.manager.data[key][3].rrBattle), SETTINGS[kind], kind + ': what arrives in the other project');
        assert.equal('rrBattle' in to.manager.data[key][2], false);
    }
    assert.equal(await to.manager.saveAllData(to.root), true);
    assert.deepEqual(JSON.parse(to.text('Enemies.json').split('\n')[4].replace(/,$/, '')).rrBattle, SETTINGS.enemy);
});

test('a cleared record and a record a smaller maximum removed keep no settings; a filtered list copies the record whole', async () => {
    const { root, manager } = await openProject();
    const ui = listUI(manager, root);
    for (const kind of T.KINDS) {
        const key = T.DATA_KEYS[kind], list = manager.data[key];
        setAll(manager, kind, 2);
        setAll(manager, kind, 3);
        // Clear.
        ui.setEditorName = () => {};
        const blank = ui.clearDatabaseEntry(key, 2);
        assert.ok(blank && list[2] === blank && list[2].id === 2, kind + ': the slot holds a blank record');
        assert.deepEqual(['rrBattle' in list[2], list[2].name], [false, ''], kind + ': a cleared record sets nothing');
        assert.deepEqual(plain(list[3].rrBattle), SETTINGS[kind], kind + ': the record beside it is as it was');
        // Change Maximum: a record grown where one was removed starts with nothing; the ones that stay are not touched.
        const template = ui.getDefaultTemplates()[key];
        const kept = list[1], keptText = JSON.stringify(kept);
        assert.equal(manager.changeMaximum(key, 2, template), true);
        assert.equal(list.length, 3);
        assert.equal(manager.changeMaximum(key, 5, template), true);
        assert.deepEqual([3, 4, 5].map(id => 'rrBattle' in list[id]), [false, false, false], kind + ': grown records set nothing');
        assert.ok(list[1] === kept && JSON.stringify(list[1]) === keptText);
        // A template never carries settings of a battle: a new record is Automatic everywhere.
        assert.equal('rrBattle' in template, false, kind);
        const fresh = ui.addDatabaseEntry(key);
        assert.equal('rrBattle' in fresh, false);
    }
    // The list's search narrows what is shown by name and id; the record it hands to Copy is the Database's own, whole.
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    assert.match(source, /const getSelectedEntries = \(\) => filteredData\s*\.filter\(entry => selectedIds\.has\(entry\.id\)[^\n]*\)\s*\.map\(entry => this\.databaseManager\.data\[type\]\?\.\[entry\.id\] \|\| entry\);/);
    assert.match(source, /filteredData = query \? data\.filter\(entry => \{/);
});

test('Cancel takes a card\'s change back, Apply keeps it, and the list\'s Undo restores the settings a list action removed', async () => {
    const { root, manager, text } = await openProject();
    const ui = listUI(manager, root);
    const before = text('Skills.json');
    setAll(manager, 'skill', 1);
    assert.equal(await manager.saveAllData(root), true);
    // The Database opens: its baseline. A card changes a setting, takes one out, sets one on a record that had none.
    ui.takeDatabaseSnapshot();
    const skills = () => manager.data.skills;
    assert.equal(JSON.stringify(manager.data) === ui._dataSnapshot, true, 'nothing to discard yet');
    set(manager, 'skill', 1, 'shared', { range: { min: 1, max: 9 }, los: true });
    set(manager, 'skill', 2, 'action', { cooldown: 9 });
    assert.deepEqual([plain(skills()[1].rrBattle), plain(skills()[2].rrBattle)], [{ range: { min: 1, max: 9 }, area: { shape: 'cone', size: 3 }, cooldown: 6.5 }, { cooldown: 9 }]);
    assert.equal(JSON.stringify(manager.data) !== ui._dataSnapshot, true, 'the close button asks before discarding');
    ui.revertDatabaseSnapshot();
    assert.deepEqual(plain(skills()[1].rrBattle), SETTINGS.skill, 'Cancel: the settings are what they were');
    assert.equal('rrBattle' in skills()[2], false, 'and a record that had none has none');
    assert.deepEqual([...manager.getDirtyKeys()], [], 'nothing unsaved is left behind');
    // Apply: the change is saved and becomes the baseline; a later Cancel keeps it.
    ui.takeDatabaseSnapshot();
    set(manager, 'skill', 2, 'action', { cooldown: 9 });
    assert.equal(await manager.saveAllData(root), true);
    ui._dataSnapshot = JSON.stringify(manager.data);
    set(manager, 'skill', 2, 'action', { cooldown: 4 });
    ui.revertDatabaseSnapshot();
    assert.deepEqual(plain(skills()[2].rrBattle), { cooldown: 9 });
    assert.deepEqual(JSON.parse(text('Skills.json').split('\n')[3].replace(/,$/, '')).rrBattle, { cooldown: 9 });
    assert.notEqual(text('Skills.json'), before);
    // The list's Undo keeps the records as they were before a list action (a copy of them all) and puts them back.
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'DatabaseEditorUI.js'), 'utf8');
    assert.match(source, /const snapshotForUndo = \(\) => undoStack\.push\(\{\s*entries: JSON\.parse\(JSON\.stringify\(this\.databaseManager\.data\[type\]\)\),/);
    assert.match(source, /const snapshot = undoStack\.pop\(\);\s*this\.databaseManager\.data\[type\] = snapshot\.entries;/);
    const undo = [];
    ui._snapshotForUndo = () => undo.push(JSON.parse(JSON.stringify(manager.data.skills)));
    ui.setEditorName = () => {};
    ui.getDefaultTemplates = () => ({ skills: { name: 'New', note: '' } });
    await ui.cutListEntries([skills()[1]], skills().filter(Boolean), 'skills', () => {}, { value: '' }, {});
    assert.deepEqual([undo.length, 'rrBattle' in skills()[1]], [1, false], 'cut: the record is blank');
    manager.data.skills = undo.pop();
    assert.deepEqual(plain(skills()[1].rrBattle), SETTINGS.skill, 'Undo: its settings are back');
    ui.copyListEntries([skills()[3]], 'skills');
    await ui.pasteListEntries(skills()[1], skills().filter(Boolean), 'skills', () => {}, { value: '' }, {});
    assert.deepEqual([undo.length, 'rrBattle' in skills()[1]], [1, false], 'a record with no settings pasted over it');
    manager.data.skills = undo.pop();
    assert.deepEqual(plain(skills()[1].rrBattle), SETTINGS.skill);
    // After Cancel and Undo the records are new objects: the game's rule holds, each has a settings object of its own.
    assert.ok(skills()[1].rrBattle !== skills()[2].rrBattle);
});
