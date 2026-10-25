const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const PickerIndex = require(path.join(repoRoot, 'src', 'utils', 'PickerIndex.js'));
const previous = require('./perf/picker-index.cjs');

test('picker index groups Unicode graphemes with audio-compatible sections', () => {
    const groups = PickerIndex.group([
        'éclair',
        'e\u0301lan',
        'Ωmega',
        'Жук',
        '不知火',
        'あかり',
        '한나',
        '123 Hero',
        '😀 Smile'
    ]);

    assert.equal(groups[0].key, '#');
    assert.deepEqual(new Set(groups.slice(1).map(group => group.key)), new Set(['É', 'Ω', 'Ж', '不', 'あ', '한']));
    assert.deepEqual(new Set(groups[0].names), new Set(['123 Hero', '😀 Smile']));
    assert.deepEqual(new Set(groups.find(group => group.key === 'É').names), new Set(['éclair', 'e\u0301lan']));
});

test('picker search is case- and accent-insensitive across relative paths', () => {
    const files = ['People/Élodie', 'People/Hero', 'Villains/Ωmega'];
    assert.equal(PickerIndex.matches('People/Élodie', 'elodie'), true);
    assert.equal(PickerIndex.matches('People/Hero', 'PEOPLE/hero'), true);
    assert.equal(PickerIndex.matches('People/Straße', 'STRASSE'), true);
    assert.equal(PickerIndex.matches('People/İpek', 'ipek'), true);
    assert.deepEqual(PickerIndex.group(files, 'ωMEGA').flatMap(group => group.names), ['Villains/Ωmega']);

    const rows = [{ offsetHeight: 18 }, { offsetHeight: 24 }, { offsetHeight: 30 }];
    assert.equal(PickerIndex.sectionOffset({ children: rows }, rows[0]), 0);
    assert.equal(PickerIndex.sectionOffset({ children: rows }, rows[2]), 42);
});

test('folder trees preserve full values and recursively count and sort their contents', () => {
    const tree = PickerIndex.buildFolderTree([
        'Root Track',
        'custom/Loose',
        'custom/Sanctuary/Chime',
        'custom/Sanctuary/Bell',
        'custom/EVFX Shoot/Laser'
    ]);

    assert.deepEqual(tree.files, ['Root Track']);
    assert.equal(tree.folders.length, 1);
    const custom = tree.folders[0];
    assert.equal(custom.path, 'custom');
    assert.equal(custom.total, 4);
    assert.deepEqual(custom.files, ['custom/Loose']);
    assert.deepEqual(custom.folders.map(folder => [folder.name, folder.path, folder.total]), [
        ['EVFX Shoot', 'custom/EVFX Shoot', 1],
        ['Sanctuary', 'custom/Sanctuary', 2]
    ]);
    assert.deepEqual(custom.folders[1].files, [
        'custom/Sanctuary/Bell', 'custom/Sanctuary/Chime'
    ]);
});

test('flat folder trees stay flat and selection paths include every ancestor', () => {
    assert.deepEqual(PickerIndex.buildFolderTree(['Bravo', 'Alpha']), {
        files: ['Alpha', 'Bravo'], folders: []
    });
    assert.deepEqual(PickerIndex.foldersLeadingTo('custom/Sanctuary/chime'), [
        'custom', 'custom/Sanctuary'
    ]);
    assert.deepEqual(PickerIndex.foldersLeadingTo('root-file'), []);
});

test('character and face pickers use the shared searchable Unicode browser', () => {
    const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
    const helper = html.indexOf('src/utils/PickerIndex.js');
    assert.ok(helper >= 0);

    const consumers = [
        'src/DatabaseEditorUI.js',
        'src/database/DatabaseAnimationEditor.js',
        'src/database/DatabaseSystem1Editor.js',
        'src/event/CharacterGraphicPicker.js',
        'src/event/ModelGraphicPicker.js',
        'src/event/commands/MessageCommandEditor.js'
    ];
    for (const relativePath of consumers) {
        const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
        assert.match(source, /RRPickerIndex\.createBrowser/, relativePath);
        assert.ok(helper < html.indexOf(relativePath), relativePath);
    }

    const helperSource = fs.readFileSync(path.join(repoRoot, 'src', 'utils', 'PickerIndex.js'), 'utf8');
    assert.match(helperSource, /searchInput\.type = 'text'/);
    assert.match(helperSource, /rr-picker-search-clear/);
    assert.match(helperSource, /color-accent-border-strong/);
    assert.match(helperSource, /list\.scrollTop = sectionOffset\(list, header\)/);
});

test('asset-image pickers opt into recursive folder rendering', () => {
    for (const relativePath of [
        'src/DatabaseEditorUI.js',
        'src/database/DatabaseAnimationEditor.js',
        'src/database/DatabaseSystem1Editor.js',
        'src/event/CharacterGraphicPicker.js',
        'src/database/DatabaseTilesetEditor.js',
        'src/event/ModelGraphicPicker.js',
        'src/event/commands/MessageCommandEditor.js'
    ]) {
        const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
        assert.match(source, /RRPickerIndex\.createBrowser\(\{[\s\S]*?folders: true,/,
            relativePath);
    }
});

test('cached sorting preserves the old Unicode, numeric, variant and stable tie ordering exactly', () => {
    const names = ['Hero10', 'Hero2', 'Hero02', 'Hero1', 'hero2', 'Héro2', 'café', 'cafe\u0301',
        'Ångström', 'A\u030angström', 'äther', 'Alpha', 'alpha', 'İpek', 'Ipek', 'ıpek',
        'Straße', 'STRASSE', 'Ωmega', 'Жук', '不知火', 'あかり', '한나', '한나', 'क्षत्र',
        '👩‍💻 Work', '🇺🇸 Actor', '😀 Smile', '123 Hero', '#effect', '', 'Hero2'];
    for (const a of names) for (const b of names) {
        assert.equal(Math.sign(PickerIndex.compareNames(a, b)), Math.sign(previous.compareNames(a, b)), JSON.stringify([a, b]));
    }
    assert.deepEqual(PickerIndex.group(names), previous.group(names));
    assert.deepEqual(PickerIndex.group(['Hero10', 'Hero2', 'Hero1'])[0].names, ['Hero1', 'Hero2', 'Hero10']);
    assert.deepEqual(PickerIndex.group(['Hero02', 'Hero2'])[0].names, ['Hero02', 'Hero2'], 'equal numeric spellings keep input order');
    assert.deepEqual(PickerIndex.group(['Hero2', 'Hero02'])[0].names, ['Hero2', 'Hero02']);
    const paths = names.filter(Boolean).map((name, i) => (i % 3 ? ['Actors', 'Actórs', '敵'][i % 3] + '/' : '') + name);
    assert.deepEqual(PickerIndex.buildFolderTree(paths), previous.buildFolderTree(paths));
});

test('group and tree work reuse Intl helpers and segment each name only once per operation', () => {
    let constructions = 0, segments = 0, collators = 0;
    const trackingIntl = {
        Segmenter: class { constructor(...args) { constructions++; this.actual = new Intl.Segmenter(...args); } segment(value) { segments++; return this.actual.segment(value); } },
        Collator: class { constructor(...args) { collators++; this.compare = new Intl.Collator(...args).compare; } }
    };
    const sandbox = { module: { exports: {} }, Intl: trackingIntl };
    vm.runInNewContext(fs.readFileSync(path.join(repoRoot, 'src/utils/PickerIndex.js'), 'utf8'), sandbox);
    const fresh = sandbox.module.exports, names = Array.from({ length: 100 }, (_, i) => (i % 2 ? 'Hero' : 'Áctor') + (100 - i));
    assert.equal(constructions, 0, 'loading the helper does no eager Intl work');
    assert.equal(collators, 0);
    fresh.group(names);
    assert.equal(constructions, 1);
    assert.equal(segments, names.length, 'grouping does not segment again per comparison or per row');
    assert.equal(collators, 4, 'two section and two numeric name comparators');
    fresh.buildFolderTree(names.map(name => 'People/' + name));
    assert.equal(segments, names.length * 2, 'a second operation owns a fresh bounded metadata cache');
    assert.equal(constructions, 1);
    assert.equal(collators, 4);
});

test('sorting still works without Intl.Segmenter or exposed Intl.Collator', () => {
    const sandbox = { module: { exports: {} }, Intl: {} };
    vm.runInNewContext(fs.readFileSync(path.join(repoRoot, 'src/utils/PickerIndex.js'), 'utf8'), sandbox);
    const fallback = sandbox.module.exports;
    assert.equal(fallback.sectionKey('e\u0301lan'), 'É');
    assert.equal(fallback.sectionKey('👩‍💻 Work'), '#');
    assert.deepEqual(Array.from(fallback.group(['Hero10', 'Hero2', 'Hero1'])[0].names), ['Hero1', 'Hero2', 'Hero10']);
    assert.equal(Math.sign(fallback.compareNames('Alpha', 'alpha')), Math.sign(previous.compareNames('Alpha', 'alpha')));
});
