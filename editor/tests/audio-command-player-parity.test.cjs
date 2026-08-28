const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const AudioCommandEditor = require(path.join(editorRoot, 'src', 'event', 'commands', 'AudioCommandEditor.js'));
const AssetFiles = require(path.join(editorRoot, 'src', 'utils', 'AssetFiles.js'));

function withAudioGlobals(run) {
    const previous = {
        window: global.window,
        RRAssetFiles: global.RRAssetFiles,
        RRAudioPickerModal: global.RRAudioPickerModal,
        alert: global.alert
    };
    const opened = [];
    global.window = { I18n: { tText: text => text } };
    global.RRAssetFiles = AssetFiles;
    global.RRAudioPickerModal = { open: options => opened.push(options) };
    global.alert = () => {};
    try {
        return run(opened);
    } finally {
        Object.assign(global, previous);
    }
}

test('Play BGM delegates directly to the current shared player and preserves stock shape', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-audio-command-'));
    try {
        fs.mkdirSync(path.join(root, 'audio', 'bgm'), { recursive: true });
        fs.writeFileSync(path.join(root, 'audio', 'bgm', 'Theme.ogg'), 'audio');
        withAudioGlobals(opened => {
            const original = { code: 241, indent: 2, parameters: [{ name: 'Theme', volume: 0, pitch: 50, pan: 0 }] };
            let saved = null;
            const editor = new AudioCommandEditor({}, { currentProject: { path: root } });
            editor.show(original, 241, command => { saved = command; });
            assert.equal(opened.length, 1);
            assert.equal(editor.modal, null, 'the legacy inline player never opens');
            assert.deepEqual(opened[0].levels, { volume: 0, pitch: 50, pan: 0 });
            assert.equal(opened[0].loopDefault, true);
            assert.deepEqual(opened[0].files.map(file => file.name), ['Theme']);

            opened[0].onOk({ name: '', volume: 0, pitch: 75, pan: -20 });
            assert.deepEqual(saved, {
                code: 241,
                indent: 2,
                parameters: [{ name: '', volume: 0, pitch: 75, pan: -20 }]
            });
            assert.equal(original.parameters[0].name, 'Theme', 'Cancel-safe clone leaves the authored command untouched');
        });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('Play SE uses the same player without enabling preview looping', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-audio-command-'));
    try {
        fs.mkdirSync(path.join(root, 'audio', 'se'), { recursive: true });
        withAudioGlobals(opened => {
            const editor = new AudioCommandEditor({}, { currentProject: { path: root } });
            editor.show(null, 250, () => {});
            assert.equal(opened[0].folderLabel, 'SE');
            assert.equal(opened[0].loopDefault, false);
        });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('Troop audio commands route through AudioCommandEditor for insert and edit', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseTroopEditor.js'), 'utf8');
    assert.match(source, /\[241, 242, 245, 246, 249, 250, 251\]\.includes\(command\.code\)[\s\S]{0,300}?getCommandEditor\('audio', AudioCommandEditor\)\.show\(null, command\.code/);
    assert.match(source, /\[241, 242, 245, 246, 249, 250, 251\]\.includes\(cmd\.code\)[\s\S]{0,300}?getCommandEditor\('audio', AudioCommandEditor\)\.show\(cmd, cmd\.code/);
    assert.match(source, /249: \[\{ name: '', volume: 90, pitch: 100, pan: 0 \}\]/);
});

test('plugin music arguments use the shared player loop defaults', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'commands', 'PluginCommandEditor.js'), 'utf8');
    assert.match(source, /loopDefault: \['bgm', 'bgs', 'me'\]\.includes\(folderName\)/);
});
