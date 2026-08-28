const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(editorRoot, '..');
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');
const annotations = require(path.join(editorRoot, 'src', 'utils', 'PluginAnnotations.js'));
const codec = require(path.join(editorRoot, 'src', 'utils', 'PluginParamCodec.js'));

class FakeElement {
    constructor(tagName) {
        this.tagName = String(tagName).toUpperCase();
        this.children = [];
        this.parentNode = null;
        this.style = {};
        this.dataset = {};
        this.listeners = {};
        this.className = '';
        this.textContent = '';
        this.value = '';
        this.disabled = false;
    }
    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    removeChild(child) {
        this.children = this.children.filter(candidate => candidate !== child);
        child.parentNode = null;
        return child;
    }
    replaceChildren(...children) {
        this.children.forEach(child => { child.parentNode = null; });
        this.children = [];
        this.append(...children);
    }
    addEventListener(type, listener) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(listener);
    }
    dispatch(type, extra = {}) {
        const event = { target: this, preventDefault() {}, ...extra };
        for (const listener of this.listeners[type] || []) listener(event);
    }
    querySelectorAll() { return []; }
    removeAttribute(name) { delete this.dataset[name]; }
    closest() { return null; }
    get innerHTML() { return ''; }
    set innerHTML(value) { if (value === '') this.replaceChildren(); }
}

const descendants = node => [node, ...node.children.flatMap(descendants)];
const elementWithText = (node, text) => descendants(node).find(element => element.textContent === text);
const elementWithClass = (node, className) => descendants(node).find(element =>
    String(element.className).split(/\s+/).includes(className));

function createSandbox({ manager = false } = {}) {
    const body = new FakeElement('body');
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        document: {
            body,
            createElement: tag => new FakeElement(tag),
            createTextNode: value => Object.assign(new FakeElement('#text'), { textContent: value })
        },
        alert() {},
        confirm: () => true,
        require,
        nw: {},
        RRPluginAnnotations: annotations,
        RRPluginParamCodec: codec
    };
    sandbox.window = sandbox;
    if (manager) {
        sandbox.PluginManager = vm.runInNewContext(`${read('src/PluginManager.js')}\nPluginManager;`, sandbox);
    }
    sandbox.PluginCommandEditor = vm.runInNewContext(
        `${read('src/event/commands/PluginCommandEditor.js')}\nPluginCommandEditor;`, sandbox);
    return sandbox;
}

test('shared struct parsing includes real command structs and complete nested definitions', () => {
    const fixturePath = path.join(
        workspaceRoot, 'template', 'Demo', 'js', 'plugins', 'PSYCHRONIC_PictureChoices.js');
    const fixture = fs.readFileSync(fixturePath, 'utf8');
    const definitions = annotations.parseStructDefinitions(fixture);
    assert.deepEqual(Object.keys(definitions), ['ChoiceImage']);
    assert.equal(definitions.ChoiceImage.pictureName.type, 'file');
    assert.equal(definitions.ChoiceImage.pictureName.dir, 'img/pictures');
    assert.equal(definitions.ChoiceImage.transitionSpeed.decimals, '2');

    const sandbox = createSandbox();
    const commandEditor = Object.create(sandbox.PluginCommandEditor.prototype);
    const commands = commandEditor.parsePluginCommands(fixture);
    const multiple = commands.find(command => command.name === 'SetMultipleChoiceImages');
    assert.equal(multiple.args[0].type, 'struct<ChoiceImage>[]');
    assert.equal(multiple.structDefinitions.ChoiceImage, multiple.structDefinitions.ChoiceImage);
    assert.equal(multiple.structDefinitions.ChoiceImage.selectedScale.default, '1.1');

    const nestedSource = `/*:
 * @command UseNested
 * @arg Value
 * @type struct<Outer>
 */
/*~struct~Outer:
 * @param Children
 * @type struct<Child>[]
 */
/*~struct~Child:
 * @param Labels
 * @type string[]
 */`;
    const nested = annotations.parseStructDefinitions(nestedSource);
    assert.deepEqual(Object.keys(nested), ['Outer', 'Child']);
    assert.equal(nested.Outer.Children.type, 'struct<Child>[]');
    assert.equal(nested.Child.Labels.type, 'string[]');
    const nestedCommand = commandEditor.parsePluginCommands(nestedSource)[0];
    assert.deepEqual(Object.keys(nestedCommand.structDefinitions), ['Outer', 'Child']);
    assert.equal(nestedCommand.structDefinitions.Outer.Children.type, 'struct<Child>[]');
});

test('codec exactly round-trips JSON-looking scalar strings and nested RPG Maker structs', () => {
    const definitions = {
        Outer: {
            Name: { type: 'string', default: '' },
            Child: { type: 'struct<Child>', default: '{}' },
            Children: { type: 'struct<Child>[]', default: '[]' },
            Values: { type: 'string[]', default: '[]' }
        },
        Child: {
            Value: { type: 'string', default: '' },
            Note: { type: 'note', default: '""' }
        }
    };
    const childOne = { Value: 'true', Note: JSON.stringify('{"json":1}') };
    const childTwo = { Value: 'null', Note: JSON.stringify('[1,2]') };
    const outer = {
        Name: '0',
        Child: JSON.stringify(childOne),
        Children: JSON.stringify([JSON.stringify(childOne), JSON.stringify(childTwo)]),
        Values: JSON.stringify(['1', 'true', 'null', '{"a":1}', '[1]'])
    };
    const raw = JSON.stringify([JSON.stringify(outer)]);
    const schema = { type: 'struct<Outer>[]' };
    const decoded = codec.deserializeComplex(raw, schema, definitions);

    assert.equal(decoded[0].Name, '0');
    assert.equal(decoded[0].Child.Value, 'true');
    assert.deepEqual(Array.from(decoded[0].Values), ['1', 'true', 'null', '{"a":1}', '[1]']);
    assert.equal(decoded[0].Children[1].Note, '[1,2]');
    assert.equal(codec.serializeComplex(decoded, schema, definitions), raw);
});

test('codec materializes omitted and legacy blank boolean and number struct fields', () => {
    const definitions = {
        Settings: {
            Enabled: { type: 'boolean', default: null },
            Count: { type: 'number', default: null }
        }
    };
    const schema = { type: 'struct<Settings>' };

    assert.deepEqual(codec.deserializeComplex('{}', schema, definitions), {
        Enabled: 'false', Count: '0'
    });
    assert.deepEqual(codec.createDefaultStructValue(definitions.Settings, definitions), {
        Enabled: 'false', Count: '0'
    });
    const legacy = codec.deserializeComplex('{"Enabled":"","Count":""}', schema, definitions);
    assert.deepEqual(legacy, { Enabled: 'false', Count: '0' });
    assert.equal(codec.serializeComplex(legacy, schema, definitions),
        '{"Enabled":"false","Count":"0"}');
});

test('malformed arrays and structs remain raw instead of becoming empty containers', () => {
    for (const schema of [{ type: 'string[]' }, { type: 'struct<Row>' }, { type: 'struct<Row>[]' }]) {
        const raw = schema.type.includes('[]') ? '[broken' : '{broken';
        const decoded = codec.deserializeComplex(raw, schema, { Row: { Name: { type: 'string' } } });
        assert.equal(decoded, raw);
        assert.equal(codec.serializeComplex(decoded, schema, { Row: { Name: { type: 'string' } } }), raw);
    }
});

test('code 357 loading deep-clones and keeps every argument at the string boundary', async () => {
    const sandbox = createSandbox();
    const editor = Object.assign(Object.create(sandbox.PluginCommandEditor.prototype), {
        modal: { style: {} },
        showLoadingState() {},
        loadAvailablePlugins: async () => {},
        renderContent() {}
    });
    const originalArgs = { count: 0, enabled: false, rows: ['a'], row: { Name: 'A' } };
    const command = { code: 357, parameters: ['Plugin', 'Run', 'Run', originalArgs] };
    editor.show(command, () => {});

    assert.deepEqual({ ...editor.args }, {
        count: '0', enabled: 'false', rows: '["a"]', row: '{"Name":"A"}'
    });
    editor.args.rows = '["changed"]';
    assert.deepEqual(originalArgs, { count: 0, enabled: false, rows: ['a'], row: { Name: 'A' } });
    assert.equal(editor.convertArgValue(0, 'number'), '0');
    assert.equal(editor.convertArgValue(false, 'boolean'), 'false');
    assert.equal(editor.convertArgValue('[]', 'struct<Row>[]'), '[]');
});

test('note and multiline command args preserve newlines while text and string stay inputs', () => {
    const sandbox = createSandbox();
    const editor = Object.create(sandbox.PluginCommandEditor.prototype);
    editor.args = { Note: 'first\nsecond', Long: 'alpha', Text: 'short', String: 'plain' };

    const note = descendants(editor.createArgumentInput({ name: 'Note', type: 'note' }))
        .find(element => element.tagName === 'TEXTAREA');
    assert.equal(note.value, 'first\nsecond');
    assert.match(note.style.cssText, /resize: vertical/);
    note.value = 'line 1\nline 2\nline 3';
    note.dispatch('input');
    assert.equal(editor.args.Note, 'line 1\nline 2\nline 3');

    assert.equal(descendants(editor.createArgumentInput({ name: 'Long', type: 'multiline_string' }))
        .some(element => element.tagName === 'TEXTAREA'), true);
    assert.equal(descendants(editor.createArgumentInput({ name: 'Text', type: 'text' }))
        .some(element => element.tagName === 'INPUT'), true);
    assert.equal(descendants(editor.createArgumentInput({ name: 'String', type: 'string' }))
        .some(element => element.tagName === 'INPUT'), true);
});

test('generic command Edit routes schema and complete definitions through PluginManager', () => {
    const sandbox = createSandbox();
    let opened;
    const editor = Object.create(sandbox.PluginCommandEditor.prototype);
    editor.args = { Rows: '[{"Name":"A"}]' };
    editor.selectedCommand = { structDefinitions: { Row: { Name: { type: 'string' } } } };
    editor._complexParameterEditor = {
        showComplexParameterEditor(options) {
            opened = options;
            options.onCommit('[{"Name":"B"}]');
        }
    };
    const section = editor.createArgumentInput({ name: 'Rows', type: 'struct<Row>[]' });
    elementWithClass(section, 'plugin-command-complex-edit').dispatch('click');

    assert.equal(opened.key, 'Rows');
    assert.equal(opened.value, '[{"Name":"A"}]');
    assert.equal(opened.schema.type, 'struct<Row>[]');
    assert.equal(opened.structDefinitions, editor.selectedCommand.structDefinitions);
    assert.equal(editor.args.Rows, '[{"Name":"B"}]');
    assert.equal(descendants(section).find(element => element.tagName === 'INPUT').value, '[{"Name":"B"}]');
});

test('generalized complex Cancel leaves its source untouched and never commits', () => {
    const sandbox = createSandbox({ manager: true });
    const manager = Object.create(sandbox.PluginManager.prototype);
    manager._tt = value => value;
    const source = ['alpha'];
    let committed = false;
    manager.showComplexParameterEditor({
        key: 'Values',
        value: source,
        schema: { type: 'string[]' },
        structDefinitions: {},
        onCommit: () => { committed = true; }
    });
    const overlay = sandbox.document.body.children[0];
    elementWithText(overlay, '+ Add Element').dispatch('click');
    elementWithText(overlay, 'Cancel').dispatch('click');

    assert.deepEqual(source, ['alpha']);
    assert.equal(committed, false);
    assert.equal(sandbox.document.body.children.length, 0);
});

test('complex and nested Plugin Manager editors stack above plugin command modals', () => {
    const sandbox = createSandbox({ manager: true });
    const manager = Object.create(sandbox.PluginManager.prototype);
    manager._tt = value => value;
    const zIndex = element => Number(element.style.cssText.match(/z-index:\s*(\d+)/)?.[1]);

    manager.showComplexParameterEditor({
        key: 'Values', value: '[]', schema: { type: 'string[]' }, structDefinitions: {},
        onCommit() {}
    });
    assert.equal(zIndex(sandbox.document.body.children.at(-1)), 10006);

    manager.showNestedStructEditor('Row', { Name: 'A' }, { type: 'struct<Row>' }, () => {}, {
        Row: { Name: { type: 'string', default: '' } }
    });
    assert.equal(zIndex(sandbox.document.body.children.at(-1)), 10007);

    manager.showArrayElementEditor(['A'], 0, { type: 'string[]' }, null, {}, () => {});
    assert.equal(zIndex(sandbox.document.body.children.at(-1)), 10007);

    manager.showNestedStructEditor('Broken', '{broken', { type: 'struct<Row>' }, () => {}, {
        Row: { Name: { type: 'string', default: '' } }
    });
    assert.equal(zIndex(sandbox.document.body.children.at(-1)), 10009,
        'raw fallback remains above an already-open nested editor');
});

test('legacy Plugin Manager complex editing still serializes into plugin parameters', () => {
    const sandbox = createSandbox({ manager: true });
    const manager = Object.create(sandbox.PluginManager.prototype);
    manager._tt = value => value;
    manager.renderPluginDetails = () => {};
    const plugin = { name: '', parameters: { Values: '["alpha"]' } };
    manager.showComplexParameterEditor(plugin, 'Values', plugin.parameters.Values, { type: 'string[]' });
    const overlay = sandbox.document.body.children[0];
    elementWithText(overlay, '+ Add Element').dispatch('click');
    descendants(overlay).find(element => element.tagName === 'TEXTAREA').parentNode.style.display = 'none';
    elementWithText(overlay, 'OK').dispatch('click');

    assert.equal(plugin.parameters.Values, '["alpha",""]');
    assert.equal(sandbox.document.body.children.length, 0);
});
