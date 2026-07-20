const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const AssetFiles = require(path.join(repoRoot, 'src', 'utils', 'AssetFiles.js'));
const AudioCommandEditor = require(path.join(repoRoot, 'src', 'event', 'commands', 'AudioCommandEditor.js'));

test('recursive asset index preserves extensionless POSIX relative names', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-assets-'));
    try {
        const files = [
            'Root.ogg',
            'Boss/Phase 2.ogg',
            'Boss/Phase 2.m4a',
            '元素/火 #1.mp3',
            'Boss/Windows Only.OGG',
            'Ignore.txt'
        ];
        for (const relativePath of files) {
            const filePath = path.join(root, relativePath);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, 'asset');
        }

        const records = AssetFiles.listUnique(root, ['.ogg', '.m4a', '.mp3']);
        assert.deepEqual(records.map(record => record.name), [
            'Boss/Phase 2',
            'Root',
            '元素/火 #1'
        ]);
        assert.equal(records[0].relativePath, 'Boss/Phase 2.ogg');
        assert.equal(AssetFiles.find(root, 'Boss\\Phase 2', ['.ogg']).relativePath, 'Boss/Phase 2.ogg');
        assert.match(AssetFiles.toUrl(records[2].absolutePath), /%23|%20/);
        assert.deepEqual(AssetFiles.listNames(root, ['.ogg'], { recursive: false }), ['Root']);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('editor loads the recursive asset index before asset consumers', () => {
    const html = fs.readFileSync(path.join(repoRoot, 'index.html'), 'utf8');
    const helper = html.indexOf('src/utils/AssetFiles.js');
    assert.ok(helper >= 0);
    assert.ok(helper < html.indexOf('src/event/commands/AudioCommandEditor.js'));
    assert.ok(helper < html.indexOf('src/ProjectController.js'));
    assert.ok(helper < html.indexOf('src/database/DatabaseAnimationEditor.js'));
});

test('project asset pickers use the shared recursive index', () => {
    const consumers = [
        'src/AudioPlayer.js',
        'src/ProjectController.js',
        'src/DatabaseEditorUI.js',
        'src/PluginManager.js',
        'src/database/DatabaseAnimationEditor.js',
        'src/database/DatabaseEnemyEditor.js',
        'src/database/DatabaseSystem1Editor.js',
        'src/database/DatabaseTilesetEditor.js',
        'src/database/DatabaseTroopEditor.js',
        'src/event/AnimationPicker.js',
        'src/event/CharacterGraphicPicker.js',
        'src/event/commands/AudioCommandEditor.js',
        'src/event/commands/MessageCommandEditor.js',
        'src/event/commands/PluginCommandEditor.js',
        'src/event/commands/SetMovementRouteEditor.js'
    ];

    for (const relativePath of consumers) {
        const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
        assert.match(source, /RRAssetFiles\.(?:find|listNames|listUnique|toUrl|urlFor)/, relativePath);
    }
});

test('audio commands discover and preserve nested RPG Maker names', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-audio-assets-'));
    try {
        const bgmRoot = path.join(root, 'audio', 'bgm');
        fs.mkdirSync(path.join(bgmRoot, 'Boss'), { recursive: true });
        fs.writeFileSync(path.join(bgmRoot, 'Theme.ogg'), 'audio');
        fs.writeFileSync(path.join(bgmRoot, 'Boss', 'Phase 2.ogg'), 'audio');
        fs.writeFileSync(path.join(bgmRoot, 'Boss', 'Preview Only.mp3'), 'audio');
        fs.writeFileSync(path.join(bgmRoot, 'Boss', 'Windows Only.OGG'), 'audio');

        const editor = new AudioCommandEditor({}, { currentProject: { path: root } });
        editor.commandType = { folder: 'bgm' };
        assert.deepEqual(editor.getProjectAudioFiles(), ['Boss/Phase 2', 'Theme']);
        assert.equal(editor.stripAudioExtension('Boss\\Phase 2.ogg'), 'Boss/Phase 2');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('character sheet markers are read from the nested asset basename', () => {
    assert.equal(AssetFiles.isBigCharacter('People/$Giant'), true);
    assert.equal(AssetFiles.isBigCharacter('Doors/!$Iron Gate'), true);
    assert.equal(AssetFiles.isObjectCharacter('Doors/!$Iron Gate'), true);
    assert.equal(AssetFiles.isObjectCharacter('Objects/!Chest'), true);
    assert.equal(AssetFiles.isBigCharacter('$Archive/Ordinary Hero'), false);
    assert.equal(AssetFiles.basename('People\\$Giant'), '$Giant');

    const consumers = [
        'src/DatabaseEditorUI.js',
        'src/EventManager.js',
        'src/database/DatabaseAnimationEditor.js',
        'src/database/DatabaseEnemyEditor.js',
        'src/database/DatabaseTroopEditor.js',
        'src/event/CharacterGraphicPicker.js',
        'src/event/EventPageEditor.js',
        'src/event/commands/ShowBalloonIconEditor.js'
    ];
    for (const relativePath of consumers) {
        const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
        assert.match(source, /RRAssetFiles\.isBigCharacter/, relativePath);
    }
});
