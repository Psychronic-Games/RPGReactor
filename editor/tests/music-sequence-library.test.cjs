/**
 * The music sequence library: Database > Music Sequences on System.json, the
 * pickers that name an entry, Change Battle BGM, and Referenced by.
 * Map Properties' half lives in bgm-sequence-editor.test.cjs; the runtime's in
 * bgm-sequence-runtime.test.cjs.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const escapeHtml = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Run editor sources in one context and hand back whatever `expose` evaluates to. */
function load(files, expose, extra = {}) {
    const context = Object.assign({ console, module: undefined }, extra);
    context.globalThis = context;
    vm.createContext(context);
    for (const file of files) vm.runInContext(read(file), context, { filename: file });
    return vm.runInContext(expose, context);
}

test('the library is the System.json array, reads as a database section, and stays off disk while empty', async () => {
    const DatabaseManager = load(['src/DatabaseManager.js'], 'DatabaseManager');
    const manager = new DatabaseManager();
    assert.equal(manager.data.musicSequences, null, 'nothing before a project opens');
    assert.equal(Object.keys(manager.data).includes('musicSequences'), false, 'not enumerable, so nothing walks it twice');

    const system = { gameTitle: 'T', reactorMusicSequences: [null] };
    manager.data.system = system;
    const entry = manager.addEntry('musicSequences', { name: 'Boss', sequence: { enabled: true, entries: [] } });
    assert.equal(entry.id, 1);
    assert.equal(system.reactorMusicSequences[1], entry, 'an added entry lands on System.json itself');
    assert.equal(manager.getMusicSequence(1).name, 'Boss');
    assert.deepEqual(manager.getMusicSequences().map(e => e.id), [1]);

    // Undo and Change Maximum assign the whole list.
    manager.data.musicSequences = [null];
    assert.deepEqual(plain(system.reactorMusicSequences), [null]);
    assert.equal(manager.hasMusicSequences(), false);

    assert.equal('reactorMusicSequences' in manager.fileContent('System.json', system), false, 'an empty library is not written');
    assert.equal(system.reactorMusicSequences.length, 1, 'and the form in memory keeps it');
    system.reactorMusicSequences.push({ id: 1, name: 'Boss', sequence: { enabled: true, entries: [] } });
    assert.equal(manager.fileContent('System.json', system), system, 'a library with an entry is written as it is');
    assert.equal(manager.fileContent('Actors.json', [null]).length, 1, 'other files are untouched');

    // Through saveJSON: the empty list is left off disk without System reading as changed.
    manager.data.musicSequences = [null];
    const written = {};
    manager.fs = { writeFileSync: (file, data) => { written[file] = data; }, existsSync: () => true };
    manager.path = path;
    manager.captureSavedState();
    assert.equal(await manager.saveJSON('/project', 'System.json', system), true);
    const onDisk = JSON.parse(written[path.join('/project', 'data', 'System.json')]);
    assert.equal('reactorMusicSequences' in onDisk, false);
    assert.equal(onDisk.gameTitle, 'T');
    assert.equal(manager.isDirty(), false);

    const source = read('src/DatabaseManager.js');
    const loadAll = source.indexOf('async loadAllData');
    assert.ok(source.indexOf('loaded.system.reactorMusicSequences = [null]', loadAll)
        < source.indexOf('this.captureSavedState();', loadAll),
        'a project without a library is given one before its saved state is taken, so opening it changes nothing');
});

test('library pickers list entries by id, keep a vanished choice visible, and escape names', () => {
    const E = load(['src/utils/BgmSequenceEditor.js'], 'RRBgmSequenceEditor', { rrEscapeHtml: escapeHtml });
    const html = E.libraryOptions([{ id: 1, name: 'Boss <1>' }, null, { id: 3, name: 'Field' }], 3, '(None)', '(missing)');
    assert.equal(html, '<option value="0">(None)</option><option value="1">0001: Boss &lt;1&gt;</option><option value="3" selected>0003: Field</option>');
    const missing = E.libraryOptions([{ id: 1, name: 'Boss' }], 7, '(None)', '(missing)');
    assert.match(missing, /<option value="7" selected>0007: \(missing\)<\/option>$/, 'an id the library lost stays chosen');
    assert.match(E.libraryOptions([], 0, 'Stored on this map', '(missing)'), /^<option value="0" selected>Stored on this map<\/option>$/);
});

test('every edit reaches onEdit, so a host without an OK button can write the sequence back', async () => {
    const E = load(['src/utils/BgmSequenceEditor.js'], 'RRBgmSequenceEditor');
    const handlers = {};
    const container = { innerHTML: '', addEventListener: (type, fn) => { handlers[type] = fn; }, contains: () => true };
    const seen = [];
    const editor = new E({ container, pickTrack: () => Promise.resolve({ name: 'Picked', volume: 70, pitch: 100, pan: 0 }), onEdit: value => seen.push(plain(value)) });
    editor.load({ enabled: true, entries: [{ type: 'track', name: 'A' }] });
    assert.equal(seen.length, 0, 'loading is not an edit');
    handlers.click({ preventDefault() {}, target: { closest: () => ({ dataset: { action: 'add-silence', path: '' } }) } });
    assert.deepEqual(seen.at(-1).entries.map(e => e.type), ['track', 'silence']);
    handlers.change({ target: { dataset: { path: 'entries.1.duration' }, value: '4' } });
    assert.equal(seen.at(-1).entries[1].duration, 4);
    handlers.change({ target: { dataset: { path: 'entries.0.once' }, checked: true } });
    assert.equal(seen.at(-1).entries[0].once, true, 'a checkbox reaches it too');
    await editor.pick('entries.0', editor.sequence.entries[0], null);
    assert.equal(seen.at(-1).entries[0].name, 'Picked');
    assert.equal(seen.length, 4);
});

/** AudioCommandEditor over the shared picker, with a document just rich enough for its row. */
function withAudioCommand(databaseManager, run) {
    const previous = { window: global.window, document: global.document, RRAssetFiles: global.RRAssetFiles, RRAudioPickerModal: global.RRAudioPickerModal };
    const opened = [];
    global.window = { I18n: { tText: text => text } };
    global.RRAssetFiles = require(path.join(editorRoot, 'src', 'utils', 'AssetFiles.js'));
    global.RRAudioPickerModal = { open: options => opened.push(options) };
    global.document = {
        createElement: () => {
            const element = { style: {}, innerHTML: '', select: { value: '0' } };
            element.querySelector = () => element.select;
            return element;
        }
    };
    require(path.join(editorRoot, 'src', 'utils', 'BgmSequenceEditor.js'));
    const AudioCommandEditor = require(path.join(editorRoot, 'src', 'event', 'commands', 'AudioCommandEditor.js'));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-music-seq-'));
    try {
        return run(opened, new AudioCommandEditor(databaseManager, { currentProject: { path: root } }));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
        Object.assign(global, previous);
    }
}

test('Change Battle BGM can name a library sequence and keeps its track as the fallback', () => {
    const library = { getMusicSequences: () => [{ id: 1, name: 'Boss' }, { id: 2, name: 'Ambush' }] };
    withAudioCommand(library, (opened, editor) => {
        let saved = null;
        editor.show(null, 132, command => { saved = command; });
        const picker = opened.at(-1);
        assert.ok(picker.extraControls, 'the Music sequence row rides above the player');
        assert.match(picker.extraControls.innerHTML, /<option value="2">0002: Ambush<\/option>/);
        picker.extraControls.select.value = '2';
        picker.onOk({ name: 'Battle1', volume: 90, pitch: 100, pan: 0 });
        assert.deepEqual(saved.parameters, [{ name: 'Battle1', volume: 90, pitch: 100, pan: 0, sequence: 'library:2' }]);

        const authored = { code: 132, indent: 1, parameters: [{ name: 'Battle1', volume: 90, pitch: 100, pan: 0, sequence: 'library:2' }] };
        editor.show(authored, 132, command => { saved = command; });
        const again = opened.at(-1);
        assert.match(again.extraControls.innerHTML, /<option value="2" selected>/, 'an authored command opens on its sequence');
        again.extraControls.select.value = '0';
        again.onOk({ name: 'Battle1', volume: 90, pitch: 100, pan: 0 });
        assert.deepEqual(saved.parameters, [{ name: 'Battle1', volume: 90, pitch: 100, pan: 0 }], '(None) leaves the stock shape');
        assert.equal(authored.parameters[0].sequence, 'library:2', 'the authored command is untouched until OK hands the copy back');

        editor.show(null, 241, () => {});
        assert.equal(opened.at(-1).extraControls, undefined, 'Play BGM has no sequence row');
    });
    withAudioCommand({ getMusicSequences: () => [] }, (opened, editor) => {
        editor.show(null, 132, () => {});
        assert.equal(opened.at(-1).extraControls, undefined, 'an empty library adds nothing to the picker');
    });
});

test('Referenced by lists the troops and Change Battle BGM commands that name a sequence', () => {
    const Finder = require(path.join(editorRoot, 'src', 'database', 'DatabaseReferenceFinder.js'));
    const change = sequence => ({ code: 132, indent: 0, parameters: [Object.assign({ name: 'Battle1', volume: 90, pitch: 100, pan: 0 }, sequence ? { sequence } : {})] });
    const data = {
        troops: [null, { id: 1, name: 'Bats', members: [], battleBgmSequenceId: 2, pages: [{ conditions: {}, list: [change('library:2')] }] },
            { id: 2, name: 'Rats', members: [], battleBgmSequenceId: 1, pages: [] }],
        commonEvents: [null, null, null, null, { id: 4, name: 'Boss', list: [change('library:2'), change(null), change('library:1')] }]
    };
    const finder = new Finder({ data, getSystem: () => ({}) });
    assert.ok(Finder.targetTypes.includes('musicSequences'));
    const rows = finder.findReferences('musicSequences', 2).map(r => [r.type, r.id, r.where, r.page]);
    assert.deepEqual(rows, [
        ['troops', 1, 'Battle Music', null],
        ['troops', 1, 'Change Battle BGM', 1],
        ['commonEvents', 4, 'Change Battle BGM', null]
    ]);
    assert.deepEqual(Finder.commandReferences(132, [{ name: 'Battle1' }]), [], 'a plain track names nothing');
});

test('the tab, the pickers and the strings are wired', () => {
    const html = read('index.html');
    assert.match(html, /<script src="src\/database\/DatabaseMusicSequenceEditor\.js"><\/script>/);
    assert.ok(html.indexOf('src/utils/BgmSequenceEditor.js') < html.indexOf('src/database/DatabaseMusicSequenceEditor.js'));
    for (const id of ['map-bgm-sequence-source', 'map-bgm-sequence-move-btn', 'map-bgm-sequence-move-hint', 'map-bgm-sequence-library-hint', 'map-battle-bgm-sequence-select']) {
        assert.match(html, new RegExp(`id="${id}"`), id);
    }
    const ui = read('src/DatabaseEditorUI.js');
    assert.match(ui, /\{ name: 'Music Sequences', type: 'musicSequences' \}/);
    assert.match(ui, /type === 'musicSequences' && this\.musicSequenceEditor/);
    assert.match(read('src/UIManager.js'), /openDatabase\('musicSequences'\)/);
    const troop = read('src/database/DatabaseTroopEditor.js');
    assert.match(troop, /bar\.appendChild\(this\.createBattleMusicSection\(\)\);/);
    assert.match(troop, /troop\.battleBgmSequenceId = id;/);
    const i18n = read('src/I18nManager.js');
    assert.match(i18n, /musicSequences: 'menu\.musicSequences'/);
    assert.equal((i18n.match(/"menu\.musicSequences": /g) || []).length, 18, 'English and the 17 locales');
});
