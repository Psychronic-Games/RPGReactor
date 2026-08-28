const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');
const annotations = require(path.join(editorRoot, 'src', 'utils', 'PluginAnnotations.js'));

class FakeElement {
    constructor(tagName) {
        this.tagName = String(tagName).toUpperCase();
        this.children = [];
        this.parentNode = null;
        this.style = {};
        this.dataset = {};
        this.listeners = {};
        this.className = '';
        this.value = '';
        this.textContent = '';
        this.disabled = false;
        this.selected = false;
    }
    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }
    append(...children) { children.forEach(child => this.appendChild(child)); }
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
        (this.listeners[type] || []).forEach(listener => listener(event));
    }
    remove() {
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter(child => child !== this);
        this.parentNode = null;
    }
    focus() { this.focused = true; }
    setSelectionRange(start, end) { this.selection = [start, end]; }
    setAttribute(name, value) { this[name] = String(value); }
    get innerHTML() { return ''; }
    set innerHTML(value) { if (value === '') this.replaceChildren(); }
}

function createSandbox() {
    const body = new FakeElement('body');
    const document = {
        body,
        createElement: tag => new FakeElement(tag),
        createTextNode: value => Object.assign(new FakeElement('#text'), { textContent: value })
    };
    const sandbox = {
        console: { log() {}, warn() {}, error() {} },
        document,
        alert() {},
        confirm: () => true,
        require,
        nw: {},
        RRPluginAnnotations: annotations,
        RRPluginParamCodec: require(path.join(editorRoot, 'src', 'utils', 'PluginParamCodec.js')),
        RRPickerIndex: {
            matches: (value, query) => String(value).toLowerCase().includes(String(query).toLowerCase())
        }
    };
    sandbox.window = sandbox;
    vm.runInNewContext(read('src/utils/PluginParamWidgets.js'), sandbox);
    sandbox.PluginManager = vm.runInNewContext(`${read('src/PluginManager.js')}\nPluginManager;`, sandbox);
    sandbox.PluginCommandEditor = vm.runInNewContext(
        `${read('src/event/commands/PluginCommandEditor.js')}\nPluginCommandEditor;`, sandbox);
    return sandbox;
}

function descendants(node) {
    return [node, ...node.children.flatMap(descendants)];
}

function byClass(node, className) {
    return descendants(node).find(element => String(element.className).split(/\s+/).includes(className));
}

test('shared annotations preserve RPG Maker option values, decimals, spaced keys, and Format B headers', () => {
    const sandbox = createSandbox();
    const commandEditor = Object.create(sandbox.PluginCommandEditor.prototype);
    const fixture = `/*:
@command Open Lore Book
@text Open Lore
@arg Troop ID
@type select
@option 0 - Window
@value 0
@option --- Use Default ---
@value
@decimals 2
@arg Targets:arraystr
@type combo[]
@option user
@option enemy index x
@option
*/`;

    const commands = commandEditor.parsePluginCommands(fixture);
    assert.equal(commands.length, 1);
    assert.equal(commands[0].name, 'Open Lore Book');
    assert.equal(commands[0].args[0].name, 'Troop ID');
    assert.deepEqual(Array.from(commands[0].args[0].options), ['0 - Window', '--- Use Default ---']);
    assert.equal(commands[0].args[0].values[0], '0');
    assert.equal(commands[0].args[0].values[1], '');
    assert.equal(1 in commands[0].args[0].values, true, 'an explicit empty @value remains paired');
    assert.equal(commands[0].args[0].decimals, '2');
    assert.equal(commands[0].args[1].name, 'Targets:arraystr');
    assert.equal(commands[0].args[1].type, 'combo[]');
    assert.deepEqual(Array.from(commands[0].args[1].options), ['user', 'enemy index x', '']);

    const manager = Object.create(sandbox.PluginManager.prototype);
    const metadata = manager.parsePluginParameterMetadata(`/*:
@param Display Mode
@type select
@option Window
@value 0
@option Default
@value
*/`);
    assert.equal(metadata['Display Mode'].values[0], '0');
    assert.equal(metadata['Display Mode'].values[1], '');
    assert.equal(1 in metadata['Display Mode'].values, true);

    assert.deepEqual(annotations.splitLine('@desc Pass the current @arg name'), [{
        tag: 'desc',
        value: 'Pass the current @arg name'
    }]);
});

test('select stores paired @value while combo remains editable and opens a searchable themed picker', () => {
    const sandbox = createSandbox();
    const writes = [];
    const select = sandbox.RRPluginParamWidgets.create({
        schema: { type: 'select', options: ['0 - Window', '1 - Dim'], values: ['0', '1'] },
        value: '1',
        onChange: value => writes.push(value)
    });
    assert.equal(select.tagName, 'SELECT');
    assert.deepEqual(select.children.map(option => option.value), ['0', '1']);
    select.value = '0';
    select.dispatch('change');
    assert.deepEqual(writes, ['0']);

    const unknown = sandbox.RRPluginParamWidgets.create({
        schema: { type: 'select', options: ['Window'], values: ['0'] },
        value: 'legacy-value',
        onChange() {}
    });
    assert.equal(unknown.children[0].value, 'legacy-value');
    assert.equal(unknown.children[0].selected, true, 'an unlisted stored value stays visible');

    const combo = sandbox.RRPluginParamWidgets.create({
        schema: { type: 'combo', options: ['user', 'enemy index x'], values: [] },
        value: 'custom target',
        onChange: value => writes.push(value),
        context: { tt: value => value }
    });
    const input = combo.children[0];
    input.value = 'pasted target';
    input.dispatch('input');
    assert.equal(writes.at(-1), 'pasted target');

    combo.children[1].dispatch('click');
    const overlay = sandbox.document.body.children.at(-1);
    assert.equal(overlay.className.includes('rr-plugin-choice-overlay'), true);
    const modal = byClass(overlay, 'rr-plugin-choice-picker');
    assert.equal(modal.role, 'dialog');
    assert.equal(modal['aria-modal'], 'true');
    assert.ok(modal['aria-labelledby']);
    assert.equal(byClass(overlay, 'rr-modal-close')['aria-label'], 'Close');
    assert.equal(descendants(overlay).some(element => String(element.style.cssText).includes('var(--')), true,
        'picker uses theme variables');
    const search = byClass(overlay, 'rr-plugin-choice-search');
    search.value = 'enemy';
    search.dispatch('input');
    const list = byClass(overlay, 'rr-plugin-choice-list');
    assert.equal(list.children.length, 1, 'picker choices are searchable');
    list.children[0].dispatch('click');
    assert.equal(writes.at(-1), 'enemy index x');
    assert.deepEqual(input.selection, [12, 13], 'placeholder x is selected for immediate editing');

    combo.children[1].dispatch('click');
    const escaped = sandbox.document.body.children.at(-1);
    escaped.dispatch('keydown', { key: 'Escape' });
    assert.equal(escaped.parentNode, null, 'Escape closes the child dialog');
});

test('choice arrays preserve JSON-string and already-parsed array representations', () => {
    const sandbox = createSandbox();
    let storedWrite;
    const stored = sandbox.RRPluginParamWidgets.create({
        schema: { type: 'combo[]', options: ['user', 'enemy'], values: [] },
        value: '["user"]',
        onChange: value => { storedWrite = value; },
        context: { tt: value => value }
    });
    const storedInput = descendants(stored).find(element => element.tagName === 'INPUT');
    storedInput.value = 'enemy';
    storedInput.dispatch('input');
    assert.equal(typeof storedWrite, 'string');
    assert.deepEqual(JSON.parse(storedWrite), ['enemy']);

    let parsedWrite;
    const parsed = sandbox.RRPluginParamWidgets.create({
        schema: { type: 'select[]', options: ['Window', 'Dim'], values: ['0', '1'] },
        value: ['0'],
        onChange: value => { parsedWrite = value; },
        context: { tt: value => value }
    });
    const parsedSelect = descendants(parsed).find(element => element.tagName === 'SELECT');
    parsedSelect.value = '1';
    parsedSelect.dispatch('change');
    assert.equal(Array.isArray(parsedWrite), true);
    assert.deepEqual(Array.from(parsedWrite), ['1']);

    let malformedWrite;
    const malformed = sandbox.RRPluginParamWidgets.create({
        schema: { type: 'combo[]', options: ['user'], values: [] },
        value: 'not valid JSON',
        onChange: value => { malformedWrite = value; }
    });
    assert.equal(malformed.tagName, 'INPUT', 'malformed stored text is not replaced by an empty list');
    malformed.value = '["user"]';
    malformed.dispatch('input');
    assert.equal(malformedWrite, '["user"]');
});

test('top-level parameters, nested struct fields, and command args use scalar and array choice widgets', () => {
    const sandbox = createSandbox();
    const manager = Object.create(sandbox.PluginManager.prototype);
    manager._tt = value => value;

    const plugin = { parameters: { Mode: '1', Targets: '["user"]' } };
    const topScalar = manager.createParameterInputWithDepth(plugin, 'Mode', '1', {
        type: 'select', options: ['Window', 'Dim'], values: ['0', '1'], text: '', desc: ''
    }, 0);
    assert.ok(byClass(topScalar, 'rr-plugin-choice-select'));
    const topArray = manager.createParameterInputWithDepth(plugin, 'Targets', '["user"]', {
        type: 'combo[]', options: ['user', 'enemy'], values: [], text: '', desc: ''
    }, 0);
    assert.ok(byClass(topArray, 'rr-plugin-choice-array'), 'choice array routes before generic Edit...');

    const structData = { Motion: 'walk', Modes: ['0'] };
    assert.ok(byClass(manager.createStructFieldInput('Motion', 'walk', {
        type: 'combo', options: ['walk', 'wait'], values: []
    }, structData), 'rr-plugin-choice-combo'));
    assert.ok(byClass(manager.createStructFieldInput('Modes', ['0'], {
        type: 'select[]', options: ['Window', 'Dim'], values: ['0', '1']
    }, structData), 'rr-plugin-choice-array'));

    const commandEditor = Object.create(sandbox.PluginCommandEditor.prototype);
    commandEditor.args = { Mode: '1', Targets: '["user"]' };
    assert.ok(byClass(commandEditor.createArgumentInput({
        name: 'Mode', type: 'select', options: ['Window', 'Dim'], values: ['0', '1'], text: '', desc: ''
    }), 'rr-plugin-choice-select'));
    assert.ok(byClass(commandEditor.createArgumentInput({
        name: 'Targets', type: 'combo[]', options: ['user', 'enemy'], values: [], text: '', desc: ''
    }), 'rr-plugin-choice-array'));
});

test('shared choice routing precedes generic arrays without replacing icon or audio paths', () => {
    const manager = read('src/PluginManager.js');
    const nestedStart = manager.indexOf('createStructFieldInput(');
    const nestedChoice = manager.indexOf('RRPluginParamWidgets.create({', nestedStart);
    const nestedComplex = manager.indexOf("type.includes('struct<') || type.includes('[]')", nestedStart);
    assert.ok(nestedChoice < nestedComplex);

    const topStart = manager.indexOf('createParameterInputWithDepth(');
    const topChoice = manager.indexOf('RRPluginParamWidgets.create({', topStart);
    const topComplex = manager.indexOf('if (isComplexType)', topStart);
    assert.ok(topChoice < topComplex);
    assert.match(manager, /metadata\.type === 'icon'/);
    assert.match(manager, /metadata\.type && metadata\.type === 'file' && metadata\.dir/);
    assert.match(manager, /metadata\.type === 'file\[\]' && metadata\.dir && this\.isAudioDir/);

    const commands = read('src/event/commands/PluginCommandEditor.js');
    assert.ok(commands.indexOf('RRPluginParamWidgets.create({') < commands.indexOf('switch (arg.type)'));
    assert.match(commands, /case 'icon'/);
    assert.match(commands, /if \(!this\.showAudioPicker\(arg, input\)\) this\.showFilePicker\(arg, input\)/);
});
