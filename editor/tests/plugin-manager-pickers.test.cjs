/**
 * `@type icon` and audio `@type file` / `file[]` parameters get the pickers
 * the rest of the editor already has. The parser has always carried the
 * types through; these pin the renderer branches and the shared picker.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

function loadPluginManager() {
    return vm.runInNewContext(`${read('src/PluginManager.js')}\nPluginManager;`, {
        console, require, nw: {}, alert: () => {},
        RRPluginAnnotations: require(path.join(repoRoot, 'src', 'utils', 'PluginAnnotations.js')),
        RRPluginParamCodec: require(path.join(repoRoot, 'src', 'utils', 'PluginParamCodec.js'))
    });
}

const FIXTURE = `/*:
 * @plugindesc Picker fixture
 * @param BadgeIcon
 * @text Badge Icon
 * @type icon
 * @default 87
 *
 * @param SoundPool
 * @text Sound Effect Pool
 * @type file[]
 * @dir audio/se/
 * @default ["Skill3"]
 *
 * @param Cursor
 * @type file
 * @dir audio/se/
 * @default Cursor1
 *
 * @param Rows
 * @type struct<Row>[]
 *
 * @command Show
 * @arg Icon
 * @type icon
 * @arg Sound
 * @type file
 * @dir audio/se/
 */
/*~struct~Row:
 * @param Icon
 * @type icon
 * @default 3
 * @param Sound
 * @type file
 * @dir audio/se/
 * @param Sounds
 * @type file[]
 * @dir audio/bgm
 */
`;

test('the parser carries icon and file types, with @dir, at every level', () => {
    const PluginManager = loadPluginManager();
    const manager = Object.create(PluginManager.prototype);
    const metadata = manager.parsePluginParameterMetadata(FIXTURE);
    assert.equal(metadata.BadgeIcon.type, 'icon');
    assert.equal(metadata.SoundPool.type, 'file[]');
    assert.equal(metadata.SoundPool.dir, 'audio/se/');
    assert.equal(metadata.Cursor.type, 'file');
    const structs = manager.parseStructDefinitions(FIXTURE);
    assert.equal(structs.Row.Icon.type, 'icon');
    assert.equal(structs.Row.Sound.type, 'file');
    assert.equal(structs.Row.Sound.dir, 'audio/se/');
    assert.equal(structs.Row.Sounds.type, 'file[]');
    assert.equal(structs.Row.Sounds.dir, 'audio/bgm');
});

test('audio folders are recognised in every spelling a plugin uses', () => {
    const PluginManager = loadPluginManager();
    const manager = Object.create(PluginManager.prototype);
    for (const dir of ['audio/se/', 'audio/se', 'audio\\bgm\\', 'audio', './audio/me/', '/audio/bgs']) {
        assert.equal(manager.isAudioDir(dir), true, dir);
    }
    for (const dir of ['img/pictures/', 'audiobook/', 'data', '']) {
        assert.equal(manager.isAudioDir(dir), false, dir);
    }
    assert.equal(manager.audioFolderLabel('audio/se/'), 'SE');
    assert.equal(manager.audioFolderLabel('audio\\bgm'), 'BGM');
    assert.equal(manager.audioFolderLabel('audio'), '');
});

test('every Plugin Manager surface routes icon and file values through the shared pickers', () => {
    const source = read('src/PluginManager.js');
    // Top level: icon before the file branch, both after the complex-type check.
    const complexAt = source.indexOf('const isComplexType = isStruct || isArray');
    const iconAt = source.indexOf("if (metadata.type === 'icon') {");
    const fileAt = source.indexOf("if (metadata.type && metadata.type === 'file' && metadata.dir) {");
    const defaultAt = source.indexOf('// Default: text input', fileAt);
    assert.ok(complexAt < iconAt && iconAt < fileAt && fileAt < defaultAt, 'top-level dispatch order');
    assert.match(source.slice(fileAt, defaultAt), /this\.createFileInput\(value, metadata\.dir/);
    // Struct fields.
    assert.match(source, /if \(type === 'icon'\) \{\s*return this\.createIconInput\(value, newValue => \{ structData\[fieldName\] = newValue; \}/);
    assert.match(source, /if \(type === 'file' && fieldSchema\.dir\) \{\s*return this\.createFileInput\(value, fieldSchema\.dir/);
    // Array elements and + Add Element.
    assert.match(source, /parentMetadata\.type === 'icon\[\]'/);
    assert.match(source, /parentMetadata\.type\.startsWith\('file'\) && parentMetadata\.dir/);
    assert.match(source, /metadata\.type === 'file\[\]' && metadata\.dir && this\.isAudioDir\(metadata\.dir\)[\s\S]*?this\.openAudioPicker\(metadata\.dir, '', name => \{\s*if \(!name\) return;[^\n]*\n\s*arrayData\.push\(name\)/);
    // Values are written as strings, like every sibling branch.
    assert.match(read('src/utils/IconPicker.js'), /const clean = String\(Math\.max\(0, Math\.floor\(Number\(index\) \|\| 0\)\)\);\s*input\.value = clean;\s*onChange\(clean\)/);
    // The audio picker hides the level cards and hands back the name only.
    assert.match(source, /levels: null,\s*previewLevels: \{ volume: 90, pitch: 100, pan: 0 \}[\s\S]*?onOk: result => onPick\(result\.name\)/);
    // Plugin command arguments.
    const commands = read('src/event/commands/PluginCommandEditor.js');
    assert.match(commands, /case 'icon': \{[\s\S]*?RRIconPicker\.createField\(/);
    assert.match(commands, /if \(!this\.showAudioPicker\(arg, input\)\) this\.showFilePicker\(arg, input\)/);
    // One picker: the database editor delegates instead of keeping a copy.
    assert.match(read('src/DatabaseEditorUI.js'), /showIconPicker\(currentIconIndex, onSelectCallback, iconSetPath\) \{\s*\/\/[^\n]*\n\s*return window\.RRIconPicker\.show\(/);
    const html = read('index.html');
    assert.ok(html.indexOf('src/utils/IconPicker.js') < html.indexOf('src/event/commands/PluginCommandEditor.js'));
});

function loadIconPicker({ sheetHeight = 640, fail = false } = {}) {
    class FakeElement {
        constructor(tag) {
            this.tagName = tag.toUpperCase();
            this.children = [];
            this.style = {};
            this.listeners = {};
            this.parentNode = null;
            this.width = 0;
            this.height = 0;
            this.draws = [];
            this.strokes = [];
        }
        appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
        removeChild(child) { this.children = this.children.filter(c => c !== child); child.parentNode = null; }
        addEventListener(type, fn) { this.listeners[type] = fn; }
        getContext() {
            const el = this;
            return {
                clearRect() {},
                drawImage(...args) { el.draws.push(args); },
                strokeRect(...args) { el.strokes.push(args); }
            };
        }
        getBoundingClientRect() { return { left: 0, top: 0 }; }
    }
    const body = new FakeElement('body');
    const images = [];
    class Image {
        constructor() { this.height = sheetHeight; this.width = 512; images.push(this); }
        set src(value) {
            this._src = value;
            queueMicrotask(() => (fail ? this.onerror && this.onerror() : this.onload && this.onload()));
        }
        get src() { return this._src; }
    }
    const alerts = [];
    const context = {
        console,
        document: { body, createElement: tag => new FakeElement(tag) },
        Image,
        alert: message => alerts.push(message),
        window: null
    };
    context.window = context;
    vm.runInNewContext(read('src/utils/IconPicker.js'), context);
    const flush = () => new Promise(resolve => setTimeout(resolve, 0));
    return { picker: context.RRIconPicker, body, images, alerts, flush, context };
}

test('the icon field writes string indices, previews through the sheet, and opens the picker', async () => {
    const { picker, body, images, flush } = loadIconPicker();
    const writes = [];
    const field = picker.createField({ value: '87', iconSetPath: '/p/img/system/IconSet.png', onChange: v => writes.push(v), zIndex: 10010 });
    const [preview, input, button] = field.children;
    assert.equal(input.value, '87');
    await flush();
    assert.equal(preview.draws.length, 1, 'the preview draws icon 87 from the cached sheet');
    assert.deepEqual(preview.draws[0].slice(1, 5), [7 * 32, 5 * 32, 32, 32], 'icon 87 is column 7, row 5');

    input.value = '16.9';
    input.listeners.change({ target: input });
    assert.deepEqual(writes, ['16'], 'a typed index is written as a whole-number string');

    button.listeners.click();
    const modal = body.children.at(-1);
    assert.equal(modal.className, 'rr-icon-picker-overlay');
    assert.equal(modal.style.cssText.includes('z-index: 10010'), true);
    await flush();
    const canvas = modal.children[0].children[1].children[0];
    canvas.onclick({ clientX: 3 * 64 + 5, clientY: 2 * 64 + 5 });
    canvas.onclick({ clientX: 40 * 64, clientY: 5 });        // past the sheet: ignored
    canvas.onclick({ clientX: 5, clientY: 99 * 64 });        // below the sheet: ignored
    const okBtn = modal.children[0].children[2].children[1].children[1];
    okBtn.onclick();
    assert.deepEqual(writes, ['16', '35'], 'row 2 column 3 is icon 35; off-sheet clicks change nothing');
    assert.equal(body.children.includes(modal), false, 'OK closes the picker');
    assert.equal(images.length, 2, 'the field used the cached sheet; the picker reloaded it');
});

test('a missing IconSet.png closes the picker and reports instead of showing an empty grid', async () => {
    const { picker, body, alerts, flush } = loadIconPicker({ fail: true });
    picker.show(0, () => assert.fail('nothing to select'), '/p/img/system/IconSet.png');
    assert.equal(body.children.length, 1);
    await flush();
    assert.equal(body.children.length, 0, 'the overlay is gone');
    assert.deepEqual(alerts, ['IconSet.png was not found in img/system.']);
    assert.equal(picker.imageUrl('C:\\Game Dev\\p#1\\img\\system\\IconSet.png'), 'file://C:/Game%20Dev/p%231/img/system/IconSet.png');
});
