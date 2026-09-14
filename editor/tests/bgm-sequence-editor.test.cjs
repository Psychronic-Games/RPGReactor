const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));

function loadEditorClass() {
    const context = { console, module: undefined, globalThis: undefined };
    context.globalThis = context;
    vm.runInNewContext(read('src/utils/BgmSequenceEditor.js') + '\n;globalThis.__E = RRBgmSequenceEditor;', context);
    return context.__E;
}

test('a sequence normalizes to its three entry shapes with clamped levels, and absent reads as nothing', () => {
    const E = loadEditorClass();
    assert.deepEqual(plain(E.normalize(null)), { enabled: false, entries: [] });
    assert.equal(E.isBlank(E.normalize(undefined)), true);
    const raw = { enabled: true, entries: [
        { type: 'track', name: 'Forest', volume: '120', pitch: 30, pan: 'x' },
        { type: 'silence', duration: '2.55' },
        { type: 'palette', duration: 30, fadeOut: 4, layers: [{ volume: 70, pool: [{ type: 'track', name: 'A' }, { type: 'silence', duration: -3 }, null] }] },
        null, 'junk'
    ] };
    const sequence = plain(E.normalize(raw));
    assert.deepEqual(sequence.entries[0], { type: 'track', name: 'Forest', fadeIn: 0, fadeOut: 0, once: false, volume: 100, pitch: 50, pan: 0 });
    assert.deepEqual(sequence.entries[1], { type: 'silence', duration: 2.6, once: false });
    assert.deepEqual(sequence.entries[2], { type: 'palette', once: false, single: false, duration: 30, fadeIn: 0, fadeOut: 4, layers: [{ volume: 70, pitch: 100, pan: 0, order: 'random', pool: [{ type: 'track', name: 'A', volume: 100 }, { type: 'silence', duration: 0 }] }] });
    assert.deepEqual(plain(E.levels(null)), { volume: 100, pitch: 100, pan: 0 }, 'a new row starts at full volume and pitch, not at the slider minimums');
    assert.deepEqual(plain(E.layer(null)).volume, 100);
    assert.equal(sequence.entries.length, 3);
    assert.equal(E.isBlank({ enabled: false, entries: sequence.entries }), false, 'a disabled sequence with entries is kept');
});

test('validation names the first fault by entry and layer, and a disabled sequence is never at fault', () => {
    const E = loadEditorClass();
    const tt = text => text;
    const check = entries => E.validate(E.normalize({ enabled: true, entries }), tt);
    assert.equal(E.validate(E.normalize({ enabled: false, entries: [] }), tt), null);
    assert.equal(check([]), 'The sequence needs at least one entry.');
    assert.equal(check([{ type: 'track', name: '' }]), 'Entry 1: choose a track.');
    assert.equal(check([{ type: 'track', name: 'A' }, { type: 'silence', duration: 0 }]), 'Entry 2: a silence needs a duration above zero.');
    assert.equal(check([{ type: 'palette', layers: [] }]), 'Entry 1: a palette needs at least one layer.');
    assert.equal(check([{ type: 'palette', duration: 5, fadeOut: 6, layers: [{ pool: [{ type: 'track', name: 'A' }] }] }]), 'Entry 1: the fade-out cannot be longer than the duration.');
    assert.equal(check([{ type: 'palette', duration: 0, fadeOut: 6, layers: [{ pool: [{ type: 'track', name: 'A' }] }] }]), null, 'an endless palette may fade for any length');
    assert.equal(check([{ type: 'palette', layers: [{ pool: [] }] }]), 'Entry 1, layer 1: the pool needs at least one entry.');
    assert.equal(check([{ type: 'palette', layers: [{ pool: [{ type: 'track', name: 'A' }] }, { pool: [{ type: 'track', name: '' }] }] }]), 'Entry 1, layer 2: choose a track for every pool entry.');
    assert.equal(check([{ type: 'palette', layers: [{ pool: [{ type: 'silence', duration: 0 }] }] }]), 'Entry 1, layer 1: a silence needs a duration above zero.');
    assert.equal(check([{ type: 'track', name: 'A' }, { type: 'silence', duration: 3 }, { type: 'palette', duration: 10, fadeOut: 2, layers: [{ pool: [{ type: 'track', name: 'B' }, { type: 'silence', duration: 1 }] }] }]), null);
});

test('the list edits its copy in place: add, move, remove, retype a number, and pick a track', async () => {
    const E = loadEditorClass();
    const handlers = {};
    const container = {
        innerHTML: '', addEventListener: (type, fn) => { handlers[type] = fn; }, contains: () => true
    };
    const picks = [];
    const editor = new E({ container, tt: t => t, t: () => 'levels', pickTrack: options => { picks.push(plain(options)); return Promise.resolve({ name: 'Chosen', volume: 55, pitch: 100, pan: 10 }); } });
    editor.load({ enabled: true, entries: [{ type: 'track', name: 'A' }, { type: 'silence', duration: 5 }] });
    const click = (action, path) => handlers.click({ preventDefault() {}, target: { closest: () => ({ dataset: { action, path } }) } });
    click('add-palette', '');
    assert.deepEqual(plain(editor.value().entries.map(e => e.type)), ['track', 'silence', 'palette']);
    click('add-layer', 'entries.2');
    assert.equal(editor.value().entries[2].layers.length, 2);
    click('add-pool-silence', 'entries.2.layers.0');
    click('add-pool-track', 'entries.2.layers.0');
    assert.deepEqual(plain(editor.value().entries[2].layers[0].pool.map(p => p.type)), ['silence', 'track']);
    click('up', 'entries.1');
    assert.deepEqual(plain(editor.value().entries.map(e => e.type)), ['silence', 'track', 'palette']);
    click('down', 'entries.0');
    assert.deepEqual(plain(editor.value().entries.map(e => e.type)), ['track', 'silence', 'palette']);
    click('remove', 'entries.2.layers.1');
    assert.equal(editor.value().entries[2].layers.length, 1);
    const input = { dataset: { path: 'entries.1.duration' }, value: '7.25' };
    handlers.change({ target: input });
    assert.equal(editor.value().entries[1].duration, 7.3);
    assert.equal(input.value, 7.3, 'the field shows what was kept');
    await editor.pick('entries.2.layers.0.pool.1', editor.sequence.entries[2].layers[0].pool[1], null);
    assert.equal(editor.value().entries[2].layers[0].pool[1].name, 'Chosen');
    assert.equal(picks[0].levels, null, 'a pool entry has no levels of its own');
    assert.deepEqual(picks[0].previewLevels, { volume: 100, pitch: 100, pan: 0 }, 'it previews with its layer');
    await editor.pick('entries.0', editor.sequence.entries[0], null);
    assert.deepEqual(plain(editor.value().entries[0]), { type: 'track', name: 'Chosen', fadeIn: 0, fadeOut: 0, once: false, volume: 55, pitch: 100, pan: 10 }, 'a track row takes the picker levels');
    assert.match(container.innerHTML, /bgm-seq-row/);
    editor.setEnabled(false);
    assert.equal(editor.value().enabled, false);
});

/** Map Properties with every field the save reads, over a map that carries a field the form does not know. */
function controllerFor(mapData, sequence, extraContext = {}) {
    const values = {
        'map-width-input': { value: String(mapData.width) }, 'map-height-input': { value: String(mapData.height) },
        'map-note-textarea': { value: mapData.note || '' }, 'map-name-input': { value: mapData.name },
        'map-display-name-input': { value: '' }, 'map-tileset-select': { value: '1' }, 'map-scroll-type-select': { value: '0' },
        'map-encounter-steps-input': { value: '30' }, 'map-disable-dashing-checkbox': { checked: false },
        'map-autoplay-bgm-checkbox': { checked: true }, 'map-autoplay-bgs-checkbox': { checked: false },
        'map-specify-battleback-checkbox': { checked: false }, 'map-battleback1-select': { value: '' }, 'map-battleback2-select': { value: '' },
        'map-parallax-image-select': { value: '' }, 'map-parallax-loop-x-checkbox': { checked: false }, 'map-parallax-loop-y-checkbox': { checked: false },
        'map-parallax-show-checkbox': { checked: false }, 'map-parallax-sx-input': { value: '0' }, 'map-parallax-sy-input': { value: '0' },
        'map-bgm-choose-btn': { focus() { this.focused = true; } }
    };
    const alerts = [];
    const context = {
        console, process, require, nw: {}, alert: m => alerts.push(m),
        document: { getElementById: id => values[id] || null },
        RR_LIMITS: { MAP_WIDTH: 512, MAP_HEIGHT: 512 },
        rrIsMapSizeSupported: (w, h) => w >= 1 && w <= 512 && h >= 1 && h <= 512,
        RRBgmSequenceEditor: loadEditorClass(),
        RRBattleMusic: require(path.join(editorRoot, 'src', 'utils', 'BattleMusic.js')),
        ...extraContext
    };
    const ProjectController = vm.runInNewContext(read('src/ProjectController.js') + '\nProjectController;', context);
    const controller = Object.create(ProjectController.prototype);
    Object.assign(controller, {
        currentEditingMap: mapData, isCreatingNewMap: false, _tt: t => t, _t: k => k,
        _mapAudio: { bgm: { name: 'Fallback', volume: 90, pitch: 100, pan: 0 }, bgs: { name: '', volume: 80, pitch: 100, pan: 0 } },
        _bgmSequenceEditor: null, _mapBgmSequence: sequence,
        mapElevation: () => null, readMap3DForm: () => null, getEncounterListFromForm: () => [],
        writeMapDataFile(data) { controller.written = JSON.parse(JSON.stringify(data)); return true; },
        saveMap3DSettings: () => false, renderMapsList() {}, tilemapManager: null,
        projectManager: { saveMapInfos: () => true }, currentProject: { maps: [] }, uiManager: { updateStatus() {} }
    });
    controller.alerts = alerts;
    controller.values = values;
    return controller;
}

test('every control round-trips, because an unhandled key silently reverts', () => {
    const E = loadEditorClass();
    const handlers = {};
    const container = { innerHTML: '', addEventListener: (type, fn) => { handlers[type] = fn; }, contains: () => true };
    const editor = new E({ container, tt: t => t, t: () => 'levels', pickTrack: () => Promise.resolve(null) });
    editor.load({ enabled: true, entries: [
        { type: 'track', name: 'A', fadeIn: 1 },
        { type: 'silence', duration: 5 },
        { type: 'palette', duration: 60, fadeIn: 2, fadeOut: 4, layers: [
            { volume: 90, pitch: 100, pan: 0, pool: [{ type: 'track', name: 'B' }, { type: 'silence', duration: 3 }] }
        ] }
    ] });

    // onChange writes the model back into the control, so a key it does not
    // handle presents as a control that refuses input -- which is how a missing
    // fadeIn branch reached a running editor. Sweep every control the form
    // renders, not just the ones a test happened to think of.
    const wanted = { duration: 3, fadeIn: 3, fadeOut: 3, volume: 70, pitch: 120, pan: -20,
                     once: true, single: true, order: 'shuffle' };
    const found = [];
    editor.container.innerHTML.replace(/<(input|select)[^>]*>/g, tag => {
        const path = (tag.match(/data-path="([^"]+)"/) || [])[1];
        if (!path) return tag;
        found.push({ path, checkbox: /type="checkbox"/.test(tag), select: /^<select/.test(tag) });
        return tag;
    });
    assert.ok(found.some(f => f.path.endsWith('.fadeIn')), 'the sweep reaches a fade-in field');
    assert.ok(found.some(f => f.checkbox), 'the sweep reaches a checkbox');
    assert.ok(found.some(f => f.select), 'the sweep reaches a select');

    for (const { path, checkbox } of found) {
        const key = path.split('.').pop();
        assert.ok(key in wanted, path + ' has no known-good value; add one');
        const target = checkbox
            ? { dataset: { path }, checked: wanted[key], value: 'on' }
            : { dataset: { path }, value: String(wanted[key]) };
        handlers.change({ target });
        assert.deepEqual(editor.resolve(path).node, wanted[key], path + ' reached the model');
    }
});

test('Map Properties carries every field the map already has and writes the sequence beside them', async () => {
    const map = { id: 3, name: 'Woods', width: 20, height: 15, data: [1, 2], events: [null], pluginField: { kept: true }, _transient: 1, bgm: { name: 'Old' } };
    const sequence = { enabled: true, entries: [{ type: 'track', name: 'A', fadeIn: 0, fadeOut: 0, once: false, volume: 80, pitch: 100, pan: 0 }, { type: 'silence', duration: 2, once: false }] };
    const controller = controllerFor(map, sequence);
    assert.equal(await controller.saveMapProperties(), true);
    const written = controller.written;
    assert.deepEqual(written.pluginField, { kept: true }, 'a field the form does not know survives OK');
    assert.equal('_transient' in written, false, 'editor-only fields do not reach the file');
    assert.deepEqual(written.bgm, { name: 'Fallback', volume: 90, pitch: 100, pan: 0 }, 'the form still owns its own fields');
    assert.deepEqual(written.bgmSequence, sequence);
    assert.equal(written.width, 20);
    assert.deepEqual(written.data, [1, 2]);
});

test('a blank sequence leaves the key off, a disabled one with entries stays, and a bad one blocks the save', async () => {
    const map = { id: 3, name: 'Woods', width: 20, height: 15, data: [], events: [], bgmSequence: { enabled: true, entries: [{ type: 'track', name: 'A' }] } };
    let controller = controllerFor(map, { enabled: false, entries: [] });
    assert.equal(await controller.saveMapProperties(), true);
    assert.equal('bgmSequence' in controller.written, false);

    controller = controllerFor(map, { enabled: false, entries: [{ type: 'silence', duration: 0, once: false }] });
    assert.equal(await controller.saveMapProperties(), true, 'disabled is not validated');
    assert.deepEqual(controller.written.bgmSequence, { enabled: false, entries: [{ type: 'silence', duration: 0, once: false }] });

    controller = controllerFor(map, { enabled: true, entries: [{ type: 'silence', duration: 0 }] });
    assert.equal(await controller.saveMapProperties(), false);
    assert.deepEqual(controller.alerts, ['Entry 1: a silence needs a duration above zero.']);
    assert.equal(controller.values['map-bgm-choose-btn'].focused, true, 'the picker is where the sequence is switched off');
    assert.equal(controller.written, undefined, 'nothing was written');
});

test('the form, the script and the strings are wired', () => {
    const html = read('index.html');
    assert.doesNotMatch(html, /map-bgm-sequence-checkbox|map-bgm-sequence-source/, 'the sequence is chosen in the picker, as battle music is');
    assert.match(html, /id="map-bgm-sequence"/);
    assert.match(html, /id="map-bgm-sequence-editor"/);
    assert.match(html, /<script src="src\/utils\/BgmSequenceEditor\.js"><\/script>/);
    const controller = read('src/ProjectController.js');
    assert.match(controller, /this\.populateBgmSequenceForm\(mapData\);/);
    assert.match(controller, /extraControls: sequenceRow \? sequenceRow\.row : undefined/);
    const i18n = read('src/I18nManager.js');
    assert.equal((i18n.match(/'mapProps\.fallbackTrack': /g) || []).length, 18, 'English and the 17 locales');
    assert.equal((i18n.match(/'mapProps\.bgmSequenceHint': /g) || []).length, 18);
    assert.doesNotMatch(i18n, /mapProps\.bgmSequence'|mapProps\.sequenceSource/, 'the checkbox and the Sequence label leave no strings behind');
});

test('the map music picker offers (None), the map’s own sequence, a staged move and the library, and OK applies the choice', () => {
    const previous = { document: global.document, RRBgmSequenceEditor: global.RRBgmSequenceEditor };
    // BattleMusic.js was required into this realm, so the row it builds needs a document here.
    global.document = { createElement: () => { const el = { style: {}, innerHTML: '', select: { value: '' } }; el.querySelector = () => el.select; return el; } };
    global.RRBgmSequenceEditor = loadEditorClass();
    try {
        const opened = [];
        const picker = { open: options => opened.push(options) };
        const entries = [{ type: 'track', name: 'A', fadeIn: 0, fadeOut: 0, once: false, volume: 80, pitch: 100, pan: 0 }];
        const map = { id: 3, name: 'Woods', width: 20, height: 15, data: [], events: [] };
        const controller = controllerFor(map, { enabled: true, entries }, {
            window: { RRAudioPickerModal: picker }, RRAudioPickerModal: picker,
            RRAssetFiles: { listUnique: () => [], AUDIO_EXTENSIONS: [] }
        });
        controller.currentProject = { maps: [], path: '/project' };
        controller.databaseManager = {
            getMusicSequences: () => [{ id: 2, name: 'Caves' }],
            getMusicSequence: id => (id === 2 ? { id: 2, name: 'Caves' } : null)
        };
        controller._mapBgmSequenceSource = 0;
        assert.equal(controller.mapBgmSequenceLabel(), 'Music sequence: Stored on this map');

        controller.openMapAudioPicker('bgm');
        const row = opened.at(-1).extraControls;
        assert.match(row.innerHTML, /<option value="0">\(None\)<\/option><option value="map" selected>Stored on this map<\/option><option value="2">0002: Caves<\/option>/);
        row.select.value = '2';
        opened.at(-1).onOk({ name: 'Town', volume: 70, pitch: 100, pan: 0 });
        assert.deepEqual(plain(controller._mapAudio.bgm), { name: 'Town', volume: 70, pitch: 100, pan: 0 }, 'the track is still the fallback');
        assert.equal(controller.mapBgmSequenceChoice(), '2');
        assert.equal(controller._mapBgmSequenceSource, 2);
        assert.equal(controller.mapBgmSequenceLabel(), 'Music sequence: Caves');

        controller.setMapBgmSequenceChoice('map');
        controller._pendingSequenceMove = { name: 'Woods', sequence: { enabled: true, entries } };
        controller.openMapAudioPicker('bgm');
        assert.match(opened.at(-1).extraControls.innerHTML, /<option value="new" selected>\(new\) Woods<\/option>/);
        assert.equal(controller.mapBgmSequenceLabel(), 'Music sequence: (new) Woods');
        opened.at(-1).extraControls.select.value = '0';
        opened.at(-1).onOk({ name: 'Town', volume: 70, pitch: 100, pan: 0 });
        assert.equal(controller._pendingSequenceMove, null, 'choosing anything else abandons the move');
        assert.equal(controller.mapBgmSequenceChoice(), '0');
        assert.equal(controller.mapBgmSequenceLabel(), null);
        assert.equal(controller.mapBgmSequenceFromForm().enabled, false);
        assert.deepEqual(plain(controller.mapBgmSequenceFromForm().entries), entries, '(None) keeps the map’s own entries for switching back');

        controller.openMapAudioPicker('bgs');
        assert.equal(opened.at(-1).extraControls, undefined, 'BGS has no sequence');
    } finally {
        Object.assign(global, previous);
    }
});

/** A database manager whose library lives on a System object, recording what it saves. */
function libraryFor(saves, { saveResult = true } = {}) {
    const system = { reactorMusicSequences: [null] };
    return {
        system,
        manager: {
            mutationGeneration: 0,
            data: { system, get musicSequences() { return system.reactorMusicSequences; } },
            addEntry(key, record) {
                const list = this.data[key];
                record.id = list.length;
                list.push(record);
                return record;
            },
            async saveJSON(projectPath, filename) { saves.push(filename); return saveResult; },
            getMusicSequences() { return system.reactorMusicSequences.filter(Boolean); }
        }
    };
}

test('Map Properties names a library entry for its music, and a track or a sequence for its battle music', async () => {
    const map = { id: 3, name: 'Woods', width: 20, height: 15, data: [], events: [], bgmSequenceId: 9, battleBgm: { name: 'Old', volume: 90, pitch: 100, pan: 0 } };
    const controller = controllerFor(map, { enabled: true, entries: [] });
    controller._mapBgmSequenceSource = 2;
    controller._mapBattleBgm = { name: 'Battle2', volume: '80', pitch: 100, pan: -10, looped: true };
    assert.equal(await controller.saveMapProperties(), true, 'an empty sequence of its own is not validated while a library entry plays');
    assert.equal(controller.written.bgmSequenceId, 2);
    assert.deepEqual(controller.written.battleBgm, { name: 'Battle2', volume: 80, pitch: 100, pan: -10 }, 'a plain track, stored clean');
    assert.equal('bgmSequence' in controller.written, false, 'nor kept beside the library entry');

    const sequence = controllerFor(map, { enabled: false, entries: [] });
    sequence._mapBattleBgm = { name: '', volume: 90, pitch: 100, pan: 0, sequence: 'library:4' };
    assert.equal(await sequence.saveMapProperties(), true);
    assert.deepEqual(sequence.written.battleBgm, { name: '', volume: 90, pitch: 100, pan: 0, sequence: 'library:4' },
        'a sequence needs no track of its own');

    const kept = controllerFor(map, { enabled: true, entries: [{ type: 'track', name: 'A', fadeIn: 0, fadeOut: 0, once: false, volume: 80, pitch: 100, pan: 0 }] });
    kept._mapBgmSequenceSource = 2;
    assert.equal(await kept.saveMapProperties(), true);
    assert.equal(kept.written.bgmSequenceId, 2);
    assert.equal(kept.written.bgmSequence.entries.length, 1, 'a sequence of its own is kept for switching back');

    const off = controllerFor(map, { enabled: false, entries: [] });
    off._mapBgmSequenceSource = 2;
    assert.equal(await off.saveMapProperties(), true);
    assert.equal('bgmSequenceId' in off.written, false, '(None) turns the library entry off too');
    assert.equal('battleBgm' in off.written, false, 'and Clear leaves no battle music behind');

    const nothing = controllerFor(map, { enabled: false, entries: [] });
    nothing._mapBattleBgm = { name: '', volume: 90, pitch: 100, pan: 0 };
    assert.equal(await nothing.saveMapProperties(), true);
    assert.equal('battleBgm' in nothing.written, false, 'an object naming neither a track nor a sequence is not stored');
});

test('a field OK removes leaves the open map too, so reopening or saving the map cannot bring it back', async () => {
    const map = { id: 3, name: 'Woods', width: 20, height: 15, data: [], events: [], _live: true,
        bgmSequenceId: 2, bgmSequence: { enabled: true, entries: [] }, battleBgm: { name: 'Battle1', volume: 90, pitch: 100, pan: 0 } };
    const controller = controllerFor(map, { enabled: false, entries: [] });
    controller._mapBgmSequenceSource = 2;
    controller._mapBattleBgm = null;
    assert.equal(await controller.saveMapProperties(), true);
    for (const key of ['bgmSequenceId', 'bgmSequence', 'battleBgm']) {
        assert.equal(key in controller.written, false, `${key} left the file`);
        assert.equal(key in map, false, `${key} left the map in memory`);
    }
    assert.equal(map._live, true, 'editor-only fields stay on the live map');
    assert.deepEqual(plain(map.bgm), { name: 'Fallback', volume: 90, pitch: 100, pan: 0 }, 'and the form’s own fields still land on it');
});

test('Move to library saves System.json before the map, and the map keeps one copy', async () => {
    const sequence = { enabled: true, entries: [{ type: 'track', name: 'A', fadeIn: 0, fadeOut: 0, once: false, volume: 80, pitch: 100, pan: 0 }] };
    const map = { id: 3, name: 'Woods', width: 20, height: 15, data: [], events: [], bgmSequence: sequence };
    const controller = controllerFor(map, sequence);
    const order = [];
    const { system, manager } = libraryFor(order);
    controller.databaseManager = manager;
    controller.currentProject = { maps: [], path: '/project' };
    const writeMap = controller.writeMapDataFile;
    controller.writeMapDataFile = data => { order.push('map'); return writeMap(data); };

    controller.stageSequenceMove();
    assert.deepEqual(controller._pendingSequenceMove.name, 'Woods', 'named after the map');
    assert.equal(system.reactorMusicSequences.length, 1, 'staging writes nothing');

    assert.equal(await controller.saveMapProperties(), true);
    assert.deepEqual(order, ['System.json', 'map']);
    assert.equal(system.reactorMusicSequences[1].name, 'Woods');
    assert.deepEqual(plain(system.reactorMusicSequences[1].sequence), sequence);
    assert.equal(controller.written.bgmSequenceId, 1);
    assert.equal('bgmSequence' in controller.written, false);
    assert.equal(controller._pendingSequenceMove, null);
});

test('a failed library save leaves the map untouched, and Cancel forgets a staged move', async () => {
    const sequence = { enabled: true, entries: [{ type: 'track', name: 'A', fadeIn: 0, fadeOut: 0, once: false, volume: 80, pitch: 100, pan: 0 }] };
    const map = { id: 3, name: 'Woods', width: 20, height: 15, data: [], events: [], bgmSequence: sequence };
    const saves = [];
    let controller = controllerFor(map, sequence);
    let library = libraryFor(saves, { saveResult: false });
    controller.databaseManager = library.manager;
    controller.currentProject = { maps: [], path: '/project' };
    controller.stageSequenceMove();
    assert.equal(await controller.saveMapProperties(), false);
    assert.equal(controller.written, undefined, 'the map was not written');
    assert.deepEqual(plain(library.system.reactorMusicSequences), [null], 'the entry was taken back out');
    assert.deepEqual(controller.alerts, ['The music sequence library could not be saved.']);
    assert.ok(controller._pendingSequenceMove, 'still staged, so OK can try again');

    controller = controllerFor(map, sequence);
    library = libraryFor(saves);
    controller.databaseManager = library.manager;
    controller.stageSequenceMove();
    controller.populateMapMusicLibraryForm(map);    // what reopening the dialog does
    assert.equal(controller._pendingSequenceMove, null);
    assert.equal(library.system.reactorMusicSequences.length, 1);

    const invalid = controllerFor(map, { enabled: true, entries: [{ type: 'track', name: '' }] });
    invalid.stageSequenceMove();
    assert.equal(invalid._pendingSequenceMove, undefined, 'a sequence with a fault is not moved');
    assert.deepEqual(invalid.alerts, ['Entry 1: choose a track.']);
});

test('a move staged and then switched off writes nothing to the library', async () => {
    const entries = [{ type: 'track', name: 'A', fadeIn: 0, fadeOut: 0, once: false, volume: 80, pitch: 100, pan: 0 }];
    const map = { id: 3, name: 'Woods', width: 20, height: 15, data: [], events: [], bgmSequence: { enabled: true, entries } };
    const saves = [];
    const controller = controllerFor(map, { enabled: false, entries });
    const { system, manager } = libraryFor(saves);
    controller.databaseManager = manager;
    controller.currentProject = { maps: [], path: '/project' };
    controller._pendingSequenceMove = { name: 'Woods', sequence: { enabled: true, entries } };
    assert.equal(await controller.saveMapProperties(), true);
    assert.deepEqual(saves, [], 'System.json was not touched');
    assert.equal(system.reactorMusicSequences.length, 1);
    assert.deepEqual(plain(controller.written.bgmSequence), { enabled: false, entries }, 'the map keeps its own copy, switched off');
    assert.equal('bgmSequenceId' in controller.written, false);
});
