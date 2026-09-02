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
    const changeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-audio-change-'));
    try {
        for (const folder of ['bgm', 'me']) fs.mkdirSync(path.join(changeRoot, 'audio', folder), { recursive: true });
        withAudioGlobals(opened => {
            const cases = [[132, 'bgm'], [133, 'me'], [139, 'me']];
            for (const [code, folder] of cases) {
                let saved = null;
                const editor = new AudioCommandEditor({}, { currentProject: { path: changeRoot } });
                editor.show(null, code, command => { saved = command; });
                const picker = opened.at(-1);
                assert.equal(picker.folderLabel, folder.toUpperCase());
                picker.onOk({ name: 'Cue', volume: 72, pitch: 96, pan: -12 });
                assert.deepEqual(saved, {
                    code, indent: 0,
                    parameters: [{ name: 'Cue', volume: 72, pitch: 96, pan: -12 }]
                });
            }
        });
    } finally {
        fs.rmSync(changeRoot, { recursive: true, force: true });
    }
});

test('Troop audio commands route through AudioCommandEditor for insert and edit', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseTroopEditor.js'), 'utf8');
    assert.match(source, /\[132, 133, 139, 241, 242, 245, 246, 249, 250, 251\]\.includes\(command\.code\)[\s\S]{0,300}?getCommandEditor\('audio', AudioCommandEditor\)\.show\(null, command\.code/);
    assert.match(source, /\[132, 133, 139, 241, 242, 245, 246, 249, 250, 251\]\.includes\(cmd\.code\)[\s\S]{0,300}?getCommandEditor\('audio', AudioCommandEditor\)\.show\(cmd, cmd\.code/);
    assert.match(source, /249: \[\{ name: '', volume: 90, pitch: 100, pan: 0 \}\]/);
    const eventList = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'EventCommandList.js'), 'utf8');
    // Change Vehicle BGM used to be listed in the troop editor by hand. It now
    // reaches a troop page through the table both hosts dispatch, which is where
    // the entry has to exist for the dialog to open there.
    assert.match(eventList, /^    140: \['changeVehicleBGMEditor'\],$/m);
    const common = fs.readFileSync(path.join(editorRoot, 'src', 'database', 'DatabaseCommonEventEditor.js'), 'utf8');
    const vehicle = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'commands', 'ChangeVehicleBGMEditor.js'), 'utf8');
    for (const code of [132, 133, 139]) {
        assert.match(eventList, new RegExp(`code === ${code}[\\s\\S]{0,120}?audioEditor\\.show\\([^,]+, code`));
        assert.match(common, new RegExp(`${code}: \\[\\{ name: '', volume: 90, pitch: 100, pan: 0 \\}\\]`));
    }
    assert.match(common, /\[132, 133, 139, 241, 242, 245, 246, 249, 250, 251\]\.includes\(code\)/);
    assert.match(vehicle, /RRAudioPickerModal\.open\(\{/);
    assert.match(vehicle, /folderLabel: 'BGM'/);
    assert.match(vehicle, /levels: \{ volume: this\.volume, pitch: this\.pitch, pan: this\.pan \}/);
});

test('plugin music arguments use the shared player loop defaults', () => {
    const source = fs.readFileSync(path.join(editorRoot, 'src', 'event', 'commands', 'PluginCommandEditor.js'), 'utf8');
    assert.match(source, /loopDefault: \['bgm', 'bgs', 'me'\]\.includes\(folderName\)/);
});
