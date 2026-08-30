const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const PickerIndex = require(path.join(repoRoot, 'src', 'utils', 'PickerIndex.js'));

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
