const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorRoot = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(editorRoot, relative), 'utf8');
const annotations = require(path.join(editorRoot, 'src', 'utils', 'PluginAnnotations.js'));
const codec = require(path.join(editorRoot, 'src', 'utils', 'PluginParamCodec.js'));
const refs = require(path.join(editorRoot, 'src', 'utils', 'PluginDataRefs.js'));
const editorNames = require(path.join(editorRoot, 'src', 'utils', 'EditorNames.js'));

const RECORD_TYPES = {
    actor: 'actors', class: 'classes', skill: 'skills', item: 'items',
    weapon: 'weapons', armor: 'armors', enemy: 'enemies', troop: 'troops',
    state: 'states', animation: 'animations', tileset: 'tilesets',
    common_event: 'commonEvents'
};
const SYSTEM_TYPES = {
    switch: 'switches', variable: 'variables', element: 'elements',
    skill_type: 'skillTypes', weapon_type: 'weaponTypes', armor_type: 'armorTypes',
    equip_type: 'equipTypes'
};
const ALL_TYPES = [...Object.keys(RECORD_TYPES), ...Object.keys(SYSTEM_TYPES)];

function database() {
    const data = { system: {} };
    for (const [type, property] of Object.entries(RECORD_TYPES)) {
        data[property] = [null, { id: 999, name: `${type} One` }, null, { id: 1, name: `${type} Three` }];
    }
    for (const [type, property] of Object.entries(SYSTEM_TYPES)) {
        data.system[property] = ['', `${type} One`, '', `${type} Three`];
    }
    data.system.elements[1] = '\\C[2]\\I[64]Fire\\I[65] Later';
    return { data };
}

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
        this.options = [];
    }
    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        if (this.tagName === 'SELECT' && child.tagName === 'OPTION') this.options.push(child);
        return child;
    }
    append(...children) { children.forEach(child => this.appendChild(child)); }
    replaceChildren(...children) {
        this.children.forEach(child => { child.parentNode = null; });
        this.children = [];
        this.options = [];
        this.append(...children);
    }
    removeChild(child) {
        this.children = this.children.filter(candidate => candidate !== child);
        child.parentNode = null;
        return child;
    }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    dispatch(type, extra = {}) {
        const event = { target: this, preventDefault() {}, stopPropagation() {}, ...extra };
        for (const listener of this.listeners[type] || []) listener(event);
    }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    focus() { this.focused = true; }
    setSelectionRange(start, end) { this.selection = [start, end]; }
    setAttribute(name, value) { this[name] = String(value); }
    removeAttribute(name) { delete this[name]; }
    getAttribute(name) { return this[name] ?? null; }
    querySelectorAll() { return []; }
    closest() { return null; }
    getBoundingClientRect() { return { top: 0, height: 20 }; }
    get innerHTML() { return ''; }
    set innerHTML(value) { if (value === '') this.replaceChildren(); }
}

const descendants = node => [node, ...node.children.flatMap(descendants)];
const byClass = (node, className) => descendants(node).find(element =>
    String(element.className).split(/\s+/).includes(className));

function sandbox() {
    const body = new FakeElement('body');
    const document = {
        body,
        activeElement: null,
        createElement: tag => new FakeElement(tag),
        createTextNode: value => Object.assign(new FakeElement('#text'), { textContent: value }),
        addEventListener() {},
        removeEventListener() {}
    };
    const context = {
        console: { log() {}, warn() {}, error() {} },
        document,
        require,
        nw: {},
        alert() {},
        confirm: () => true,
        RRPluginAnnotations: annotations,
        RRPluginParamCodec: codec,
        RREditorNames: editorNames,
        RRPickerIndex: {
            matches: (value, query) => String(value).toLowerCase().includes(String(query).toLowerCase())
        },
        RRIconPicker: {
            iconSetPathFor: projectPath => `${projectPath}/img/system/IconSet.png`,
            imageUrl: filePath => `asset://${filePath}`
        }
    };
    context.window = context;
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(read('src/utils/PluginDataRefs.js'), context);
    vm.runInContext(read('src/utils/PluginParamWidgets.js'), context);
    context.PluginManager = vm.runInContext(`${read('src/PluginManager.js')}\nPluginManager;`, context);
    context.PluginCommandEditor = vm.runInContext(
        `${read('src/event/commands/PluginCommandEditor.js')}\nPluginCommandEditor;`, context);
    return context;
}

const schema = type => ({ ...annotations.blankSchema(), type, text: type });
const widgetContext = db => ({
    database: db,
    projectPath: '/project',
    iconSetPath: '/project/img/system/IconSet.png',
    tt: value => value
});

test('all 19 reference types and [] forms map to the exact DatabaseManager properties', () => {
    assert.deepEqual({ ...refs.RECORD_SOURCES }, RECORD_TYPES);
    assert.deepEqual({ ...refs.SYSTEM_SOURCES }, SYSTEM_TYPES);
    const db = database();

    for (const [type, property] of Object.entries(RECORD_TYPES)) {
        assert.deepEqual(refs.sourceFor(type), { type, scope: 'data', property });
        assert.deepEqual(refs.entriesFor(type, db).map(entry => entry.id), [1, 3], type);
        assert.equal(refs.entriesFor(type, db)[0].name, `${type} One`);
        assert.equal(refs.isRefType(`${type}[]`), true, `${type}[]`);
    }
    for (const [type, property] of Object.entries(SYSTEM_TYPES)) {
        assert.deepEqual(refs.sourceFor(type), { type, scope: 'system', property });
        assert.deepEqual(refs.entriesFor(type, db).map(entry => entry.id), [1, 2, 3], type);
        assert.equal(refs.entriesFor(type, db)[1].name, '', `${type} retains its blank slot`);
        assert.equal(refs.isRefType(`${type}[]`), true, `${type}[]`);
    }
    assert.equal(refs.isRefType('number'), false);
    assert.equal(refs.sourceFor('common_event[]').property, 'commonEvents');
});

test('IDs resolve strictly by array index and descriptions distinguish none, known, unnamed, and missing', () => {
    const db = database();
    assert.equal(refs.resolve('enemy', db, '1').name, 'enemy One');
    assert.equal(refs.resolve('enemy', db, 3).name, 'enemy Three');
    assert.equal(refs.resolve('enemy', db, '2'), null, 'record holes are missing');
    assert.equal(refs.resolve('switch', db, '2').name, '', 'blank System slots still resolve');
    assert.equal(refs.describe('enemy', db, '0'), '(None)');
    assert.equal(refs.describe('enemy', db, '1'), '0001: enemy One');
    assert.equal(refs.describe('switch', db, '2'), '0002: Unnamed');
    assert.equal(refs.describe('enemy', db, '2'), '(missing)');
    assert.equal(refs.describe('enemy', db, '999'), '(missing)');
    assert.equal(refs.describe('enemy', db, ''), '');

    for (const malformed of ['name', '-1', '1.5', '1.0', '01', '1e0', Infinity, NaN]) {
        assert.equal(refs.resolve('enemy', db, malformed), null, String(malformed));
        assert.equal(refs.describe('enemy', db, malformed), '(missing)', String(malformed));
    }
    assert.equal(refs.parseId(' 3 '), 3);
});

test('unloaded and genuinely empty sources decline while blank System slots remain enumerable', () => {
    assert.equal(refs.hasEntries('enemy', null), false);
    assert.equal(refs.hasEntries('enemy', { data: {} }), false);
    assert.equal(refs.hasEntries('enemy', { data: { enemies: [null, null] } }), false);
    assert.equal(refs.hasEntries('element', { data: { system: null } }), false);
    assert.equal(refs.hasEntries('element', { data: { system: { elements: [''] } } }), false);
    assert.equal(refs.hasEntries('element', { data: { system: { elements: ['', ''] } } }), true);
});

test('display escape codes are stripped while the first icon survives', () => {
    const raw = '\\C[2]\\I[64]Fire \\I[65]Later\\{\\G';
    assert.equal(refs.stripTextCodes(raw), 'Fire Later');
    assert.equal(refs.iconIndexFor(raw), 64);
    const entry = refs.entriesFor('element', database())[0];
    assert.equal(entry.name, 'Fire Later');
    assert.equal(entry.iconIndex, 64);
});

test('a future editorName callback supplies dual labels and searchable text without changing data', () => {
    const db = database();
    const before = JSON.stringify(db.data);
    const options = {
        editorName: details => details.type === 'enemy' && details.id === 1 ? 'Tutorial Punchbag' : '',
        editorNameFirst: true
    };
    const entry = refs.entriesFor('enemy', db, options)[0];
    assert.equal(refs.labelForEntry(entry), '0001: Tutorial Punchbag (enemy One)');
    assert.match(entry.searchText, /enemy One/);
    assert.match(entry.searchText, /Tutorial Punchbag/);
    assert.equal(JSON.stringify(db.data), before, 'editor names are not stored in project data');

    const context = sandbox();
    const control = context.RRPluginParamWidgets.create({
        schema: schema('enemy'), value: '1', onChange() {},
        context: { ...widgetContext(db), ...options }
    });
    control.children[2].dispatch('click');
    const search = byClass(context.document.body, 'rr-plugin-choice-search');
    search.value = 'punchbag';
    search.dispatch('input');
    const list = byClass(context.document.body, 'rr-plugin-choice-list');
    assert.equal(list.children.length, 1);
    assert.equal(list.children[0]['aria-label'], '0001: Tutorial Punchbag (enemy One)');
});

test('plugin database references use the editor-name sidecar and list-label preference', () => {
    const context = sandbox();
    const db = database();
    db.data.editorNames = editorNames.create();
    editorNames.set(db.data.editorNames, 'enemies', 1, 'Training Dummy');
    let mode = 'editorFirst';
    context.reactor = {
        optionsManager: { getDatabaseListLabels: () => mode }
    };

    const makeControl = () => context.RRPluginParamWidgets.create({
        schema: schema('enemy'), value: '1', onChange() {}, context: widgetContext(db)
    });
    assert.equal(byClass(makeControl(), 'rr-plugin-data-ref-label').title,
        '0001: Training Dummy (enemy One)');

    mode = 'gameFirst';
    assert.equal(byClass(makeControl(), 'rr-plugin-data-ref-label').title,
        '0001: enemy One (Training Dummy)');

    mode = 'gameOnly';
    assert.equal(byClass(makeControl(), 'rr-plugin-data-ref-label').title,
        '0001: enemy One');
});

test('every scalar reference is editable, readable, browsable, and can display an IconSet crop', () => {
    const context = sandbox();
    const db = database();
    for (const type of ALL_TYPES) {
        const writes = [];
        const control = context.RRPluginParamWidgets.create({
            schema: schema(type), value: '1', onChange: value => writes.push(value), context: widgetContext(db)
        });
        assert.ok(byClass(control, 'rr-plugin-data-ref-id'), type);
        assert.match(byClass(control, 'rr-plugin-data-ref-label').title, /^0001:/, type);
        const input = byClass(control, 'rr-plugin-data-ref-id');
        input.value = '999';
        input.dispatch('input');
        assert.equal(writes.at(-1), '999', `${type} keeps unknown ID text`);
        assert.equal(input.value, '999');
        assert.equal(byClass(control, 'rr-plugin-data-ref-label').title, '(missing)');
        assert.ok(byClass(control, 'rr-plugin-data-ref-browse'), type);
    }

    const element = context.RRPluginParamWidgets.create({
        schema: schema('element'), value: '1', onChange() {}, context: widgetContext(db)
    });
    const icon = byClass(element, 'rr-plugin-ref-icon');
    assert.equal(icon.style.backgroundPosition, '-0px -80px');
    assert.match(icon.style.backgroundImage, /IconSet\.png/);
});

test('reference pickers are accessible, searchable, lead with None, and write IDs', () => {
    const context = sandbox();
    let stored;
    const control = context.RRPluginParamWidgets.create({
        schema: schema('skill'), value: '999', onChange: value => { stored = value; },
        context: widgetContext(database())
    });
    control.children[2].dispatch('click');
    const modal = byClass(context.document.body, 'rr-plugin-choice-picker');
    assert.equal(modal.role, 'dialog');
    assert.equal(modal['aria-modal'], 'true');
    const list = byClass(context.document.body, 'rr-plugin-choice-list');
    assert.equal(list.children[0].dataset.value, '0');
    assert.equal(list.children[0].textContent, '(None)');
    assert.equal(list.children[1].tagName, 'BUTTON');
    list.children[1].dispatch('click');
    assert.equal(stored, '1');
});

test('animation references use the live preview picker and preserve string storage', () => {
    const context = sandbox();
    const opens = [];
    context.AnimationPickerModal = { open: options => opens.push(options) };
    let stored;
    const control = context.RRPluginParamWidgets.create({
        schema: schema('animation'), value: '1', onChange: value => { stored = value; },
        context: widgetContext(database())
    });

    byClass(control, 'rr-plugin-data-ref-browse').dispatch('click');
    assert.equal(opens.length, 1);
    assert.equal(opens[0].projectPath, '/project');
    assert.equal(opens[0].currentId, 1);
    assert.equal(opens[0].allowNormalAttack, false);

    opens[0].onPick(3);
    assert.equal(stored, '3');
    assert.equal(byClass(control, 'rr-plugin-data-ref-id').value, '3');
    assert.equal(byClass(control, 'rr-plugin-data-ref-label').title, '0003: animation Three');
    assert.equal(byClass(context.document.body, 'rr-plugin-choice-picker'), undefined,
        'the generic ID picker was not opened');

    let arrayStored;
    const array = context.RRPluginParamWidgets.create({
        schema: schema('animation[]'), value: '["1"]',
        onChange: value => { arrayStored = value; }, context: widgetContext(database())
    });
    byClass(array, 'rr-plugin-data-ref-browse').dispatch('click');
    opens[1].onPick(3);
    assert.equal(arrayStored, '["3"]');
});

test('animation references retain the generic picker when live preview is unavailable', () => {
    const context = sandbox();
    const control = context.RRPluginParamWidgets.create({
        schema: schema('animation'), value: '1', onChange() {},
        context: widgetContext(database())
    });
    byClass(control, 'rr-plugin-data-ref-browse').dispatch('click');
    assert.ok(byClass(context.document.body, 'rr-plugin-choice-picker'));
});

test('all reference arrays preserve string/parsed shape, malformed raw input, and Add starts at 0', () => {
    const context = sandbox();
    const db = database();
    for (const type of ALL_TYPES) {
        let stringWrite;
        const stored = context.RRPluginParamWidgets.create({
            schema: schema(`${type}[]`), value: '["1"]', onChange: value => { stringWrite = value; },
            context: widgetContext(db)
        });
        assert.ok(byClass(stored, 'rr-plugin-choice-array'), `${type}[] string`);
        byClass(stored, 'rr-plugin-choice-add').dispatch('click');
        assert.equal(stringWrite, '["1","0"]', type);

        let arrayWrite;
        const parsed = context.RRPluginParamWidgets.create({
            schema: schema(`${type}[]`), value: ['1'], onChange: value => { arrayWrite = value; },
            context: widgetContext(db)
        });
        byClass(parsed, 'rr-plugin-choice-add').dispatch('click');
        assert.equal(Array.isArray(arrayWrite), true, type);
        assert.deepEqual(Array.from(arrayWrite), ['1', '0'], type);
    }

    let malformedWrite;
    const malformed = context.RRPluginParamWidgets.create({
        schema: schema('enemy[]'), value: '[broken', onChange: value => { malformedWrite = value; },
        context: widgetContext(db)
    });
    assert.equal(malformed.tagName, 'INPUT');
    assert.equal(malformed.value, '[broken');
    malformed.value = '["1"]';
    malformed.dispatch('input');
    assert.equal(malformedWrite, '["1"]');
});

test('the factory declines a reference when only that source is unloaded or empty', () => {
    const context = sandbox();
    const unloaded = { data: { enemies: [], skills: [null, { name: 'Attack' }], system: {} } };
    assert.equal(context.RRPluginParamWidgets.create({
        schema: schema('enemy'), value: '1', context: widgetContext(unloaded)
    }), null);
    assert.ok(context.RRPluginParamWidgets.create({
        schema: schema('skill'), value: '1', context: widgetContext(unloaded)
    }));
});

test('Plugin Manager top-level and struct fields and Plugin Command args share reference context', () => {
    const context = sandbox();
    const db = database();
    const projectController = {
        databaseManager: db,
        getCurrentProject: () => ({ path: '/project' })
    };
    const manager = Object.assign(Object.create(context.PluginManager.prototype), {
        projectController,
        _tt: value => value
    });
    const plugin = { parameters: { Enemy: '1' } };
    assert.ok(byClass(manager.createParameterInputWithDepth(
        plugin, 'Enemy', '1', schema('enemy'), 0), 'rr-plugin-data-ref'));
    assert.ok(byClass(manager.createStructFieldInput(
        'Skill', '1', schema('skill'), { Skill: '1' }), 'rr-plugin-data-ref'));
    assert.equal(manager.pluginWidgetContext().database, db);
    assert.equal(manager.pluginWidgetContext().projectPath, '/project');
    assert.equal(manager.pluginWidgetContext().iconSetPath, '/project/img/system/IconSet.png');

    const command = Object.assign(Object.create(context.PluginCommandEditor.prototype), {
        databaseManager: db,
        projectController,
        args: { Element: '1' }
    });
    assert.ok(byClass(command.createArgumentInput({ name: 'Element', ...schema('element') }), 'rr-plugin-data-ref'));
    assert.equal(command.pluginWidgetContext(value => value).database, db);
});

test('Plugin Manager struct-array rows resolve reference summaries and preserve non-reference summaries', () => {
    const context = sandbox();
    const db = database();
    const manager = Object.assign(Object.create(context.PluginManager.prototype), {
        projectController: { databaseManager: db, getCurrentProject: () => ({ path: '/project' }) },
        _tt: value => value
    });
    assert.equal(manager.describeStructFieldValue('1', schema('enemy')), '0001: enemy One');
    assert.equal(manager.describeStructFieldValue('0', schema('enemy')), '(None)');
    assert.equal(manager.describeStructFieldValue('2', schema('enemy')), '(missing)');
    assert.equal(manager.describeStructFieldValue('Thunder', schema('string')), 'Thunder');
    assert.equal(manager.describeStructFieldValue(['1'], schema('enemy[]')), '1');
    assert.equal(manager.describeStructFieldValue('[broken', schema('enemy[]')), '[broken');

    const container = new FakeElement('div');
    manager.renderArrayStructureEditor(container, [{ Enemy: '1' }], schema('struct<Row>[]'), {
        Row: { Enemy: schema('enemy') }
    }, {});
    assert.equal(descendants(container).some(element => element.textContent === '0001: enemy One'), true);
});

test('color keeps raw text authoritative and the native swatch only edits valid #RRGGBB', () => {
    const context = sandbox();
    const cases = ['#AABBCCDD', 'rgba(1,2,3,.5)', 'red', 'plugin:accent'];
    for (const original of cases) {
        let written;
        const control = context.RRPluginParamWidgets.create({
            schema: schema('color'), value: original, onChange: value => { written = value; }
        });
        const raw = byClass(control, 'rr-plugin-color-raw');
        const swatch = byClass(control, 'rr-plugin-color-swatch');
        assert.equal(raw.value, original);
        assert.equal(swatch.disabled, true);
        swatch.value = '#112233';
        swatch.dispatch('input');
        assert.equal(written, undefined, `${original} is not overwritten by the native picker`);
        assert.equal(raw.value, original);
    }

    const writes = [];
    const valid = context.RRPluginParamWidgets.create({
        schema: schema('color'), value: '#AABBCC', onChange: value => writes.push(value)
    });
    const raw = byClass(valid, 'rr-plugin-color-raw');
    const swatch = byClass(valid, 'rr-plugin-color-swatch');
    assert.equal(raw.value, '#AABBCC', 'initial case is not normalized');
    assert.equal(swatch.disabled, false);
    swatch.value = '#123456';
    swatch.dispatch('input');
    assert.equal(raw.value, '#123456');
    assert.equal(writes.at(-1), '#123456');
    raw.value = '#12345678';
    raw.dispatch('input');
    assert.equal(writes.at(-1), '#12345678');
    assert.equal(swatch.disabled, true);
});

test('color[] preserves storage shape and malformed raw text on all three surfaces', () => {
    const context = sandbox();
    let stored;
    const list = context.RRPluginParamWidgets.create({
        schema: schema('color[]'), value: '["#112233","rgba(0,0,0,.5)"]',
        onChange: value => { stored = value; }
    });
    const raws = descendants(list).filter(element =>
        String(element.className).split(/\s+/).includes('rr-plugin-color-raw'));
    raws[0].value = '#445566';
    raws[0].dispatch('input');
    assert.equal(stored, '["#445566","rgba(0,0,0,.5)"]');

    const malformed = context.RRPluginParamWidgets.create({
        schema: schema('color[]'), value: '[colors', onChange() {}
    });
    assert.equal(malformed.tagName, 'INPUT');
    assert.equal(malformed.value, '[colors');

    const db = database();
    const projectController = { databaseManager: db, getCurrentProject: () => ({ path: '/project' }) };
    const manager = Object.assign(Object.create(context.PluginManager.prototype), {
        projectController, _tt: value => value
    });
    const plugin = { parameters: { Color: '#112233' } };
    assert.ok(byClass(manager.createParameterInputWithDepth(plugin, 'Color', '#112233', schema('color'), 0), 'rr-plugin-color'));
    assert.ok(byClass(manager.createStructFieldInput('Color', '#112233', schema('color'), { Color: '#112233' }), 'rr-plugin-color'));
    const command = Object.assign(Object.create(context.PluginCommandEditor.prototype), {
        projectController, databaseManager: db, args: { Color: '#112233' }
    });
    assert.ok(byClass(command.createArgumentInput({ name: 'Color', ...schema('color') }), 'rr-plugin-color'));
});

test('Plugin Command booleans honor authored on/off labels but retain true/false values', () => {
    const context = sandbox();
    const parser = Object.create(context.PluginCommandEditor.prototype);
    const [parsed] = parser.parsePluginCommands(`/*:
 * @command Run
 * @arg Enabled
 * @type boolean
 * @on Enabled Label
 * @off Disabled Label
 */`);
    assert.equal(parsed.args[0].on, 'Enabled Label');
    assert.equal(parsed.args[0].off, 'Disabled Label');
    const command = Object.assign(Object.create(context.PluginCommandEditor.prototype), {
        args: { Enabled: 'false' }
    });
    const section = command.createArgumentInput({
        name: 'Enabled', type: 'boolean', on: 'Enabled Label', off: 'Disabled Label'
    });
    const select = descendants(section).find(element => element.tagName === 'SELECT');
    assert.deepEqual(select.children.map(option => [option.value, option.textContent]), [
        ['true', 'Enabled Label'], ['false', 'Disabled Label']
    ]);
    select.value = 'true';
    select.dispatch('change');
    assert.equal(command.args.Enabled, 'true');
});

test('Plugin Command materializes blank boolean and number values before saving', () => {
    const context = sandbox();
    const command = Object.assign(Object.create(context.PluginCommandEditor.prototype), {
        classicMode: false,
        pluginName: 'ExamplePlugin',
        commandName: 'Run',
        commandText: 'Run',
        args: { Enabled: '', Count: '' },
        existingArgumentCommands: [],
        selectedCommand: {
            name: 'Run',
            args: [
                { name: 'Enabled', type: 'boolean', on: 'On', off: 'Off' },
                { name: 'Count', type: 'number' }
            ]
        }
    });

    command.createArgumentInput(command.selectedCommand.args[0]);
    command.createArgumentInput(command.selectedCommand.args[1]);
    assert.deepEqual(command.args, { Enabled: 'false', Count: '0' });
    const block = command.buildCommand();
    assert.deepEqual({ ...block[0].parameters[3] }, { Enabled: 'false', Count: '0' });
    assert.deepEqual(Array.from(block.slice(1), row => row.parameters[0]), [
        'Enabled = Off', 'Count = 0'
    ]);
});

test('image file parameters share a recursive browser and preview on every plugin surface', () => {
    const context = sandbox();
    const records = [
        { name: 'ring_a', absolutePath: '/project/img/pictures/ring_a.png' },
        { name: 'WEB/Twitter', absolutePath: '/project/img/pictures/WEB/Twitter.png' }
    ];
    let browserOptions;
    context.RRAssetFiles = {
        listUnique: () => records,
        toUrl: filePath => `asset://${filePath}`
    };
    context.RRPickerIndex.createBrowser = options => {
        browserOptions = options;
        return {
            element: context.document.createElement('div'),
            list: context.document.createElement('div'),
            focusSelected() {}
        };
    };
    const serviceContext = {
        projectPath: '/project',
        fs: { existsSync: () => true },
        path: { join: (...parts) => parts.join('/') },
        tt: value => value,
        zIndex: 10010
    };
    const imageSchema = { type: 'file', dir: 'img/pictures/' };
    const writes = [];
    const field = context.RRPluginParamWidgets.create({
        schema: imageSchema,
        value: 'ring_a',
        onChange: value => writes.push(value),
        context: serviceContext
    });
    assert.ok(byClass(field, 'rr-plugin-image-file'));
    byClass(field, 'rr-plugin-image-browse').dispatch('click');
    assert.equal(browserOptions.folders, true);
    assert.equal(browserOptions.selectedName, 'ring_a');
    assert.deepEqual(Array.from(browserOptions.files), ['ring_a', 'WEB/Twitter']);

    browserOptions.onSelect('WEB/Twitter');
    const overlay = context.document.body.children.at(-1);
    const modal = byClass(overlay, 'rr-plugin-image-picker');
    assert.equal(modal.getAttribute('aria-labelledby'),
        byClass(modal, 'rr-modal-title').id);
    const image = descendants(overlay).find(element => element.tagName === 'IMG');
    image.naturalWidth = 80;
    image.naturalHeight = 80;
    image.dispatch('load');
    assert.equal(image.src, 'asset:///project/img/pictures/WEB/Twitter.png');
    assert.ok(descendants(overlay).some(element => element.textContent === 'WEB/Twitter - 80 x 80'));
    byClass(overlay, 'rr-button-primary').dispatch('click');
    assert.equal(writes.at(-1), 'WEB/Twitter');

    context.RRPluginParamWidgets.showImagePicker({
        schema: imageSchema,
        current: 'WEB/missing',
        context: serviceContext,
        onPick: value => writes.push(value)
    });
    const staleOverlay = context.document.body.children.at(-1);
    assert.equal(browserOptions.selectedName, 'WEB/missing');
    assert.equal(browserOptions.openSelectedFolders, false);
    assert.ok(descendants(staleOverlay)
        .some(element => element.textContent === '(Image not found)'));
    byClass(staleOverlay, 'rr-btn-secondary').dispatch('click');
    assert.notEqual(writes.at(-1), 'WEB/missing', 'Cancel does not commit a stale value');

    const manager = Object.assign(Object.create(context.PluginManager.prototype), {
        projectController: { getCurrentProject: () => ({ path: '/project' }), databaseManager: database() },
        fs: serviceContext.fs,
        path: serviceContext.path,
        _tt: value => value
    });
    assert.ok(byClass(manager.createStructFieldInput(
        'Picture', 'ring_a', imageSchema, { Picture: 'ring_a' }), 'rr-plugin-image-file'));
    assert.ok(byClass(manager.createParameterInputWithDepth(
        { parameters: { Picture: 'ring_a' } }, 'Picture', 'ring_a', imageSchema, 0),
    'rr-plugin-image-file'));

    const command = Object.assign(Object.create(context.PluginCommandEditor.prototype), {
        projectController: manager.projectController,
        databaseManager: manager.projectController.databaseManager,
        fs: serviceContext.fs,
        path: serviceContext.path,
        args: { Picture: 'ring_a' }
    });
    assert.ok(byClass(command.createArgumentInput({ name: 'Picture', ...imageSchema }),
        'rr-plugin-image-file'));
});

test('image file arrays preserve parsed and encoded storage shapes', () => {
    const context = sandbox();
    context.RRAssetFiles = { listUnique: () => [], toUrl: value => value };
    const widgetContext = {
        projectPath: '/project', fs: { existsSync: () => true },
        path: { join: (...parts) => parts.join('/') }
    };
    const schema = { type: 'file[]', dir: 'img/pictures' };
    let parsed;
    let encoded;
    const parsedWidget = context.RRPluginParamWidgets.create({
        schema, value: ['A', 'WEB/B'], context: widgetContext,
        onChange: value => { parsed = value; }
    });
    const encodedWidget = context.RRPluginParamWidgets.create({
        schema, value: '["A","WEB/B"]', context: widgetContext,
        onChange: value => { encoded = value; }
    });
    byClass(parsedWidget, 'rr-plugin-choice-add').dispatch('click');
    byClass(encodedWidget, 'rr-plugin-choice-add').dispatch('click');
    assert.deepEqual(Array.from(parsed), ['A', 'WEB/B', '']);
    assert.equal(encoded, '["A","WEB/B",""]');
});

test('image widgets normalize authored separators and decline missing directories', () => {
    const context = sandbox();
    let scanned;
    context.RRAssetFiles = {
        listUnique: directory => { scanned = directory; return []; },
        toUrl: value => value
    };
    context.RRPickerIndex.createBrowser = () => ({
        element: context.document.createElement('div'),
        list: context.document.createElement('div'),
        focusSelected() {}
    });
    const widgetContext = {
        projectPath: '/project',
        fs: { existsSync: directory => !directory.includes('missing') },
        path: { join: (...parts) => parts.join('/') }
    };
    assert.equal(context.RRPluginParamWidgets.isImageDir('img\\pictures\\'), true);
    context.RRPluginParamWidgets.imageRecords(
        { type: 'file', dir: 'img\\pictures\\' }, widgetContext);
    assert.equal(scanned, '/project/img/pictures');
    assert.equal(context.RRPluginParamWidgets.create({
        schema: { type: 'file', dir: 'img/missing' }, value: 'Old', context: widgetContext
    }), null);
});

test('Plugin Command Editor adopts Web host filesystem and path services', () => {
    const context = sandbox();
    const host = { fs: { marker: 'web-fs' }, path: { marker: 'web-path' } };
    context.RPGReactorHost = host;
    const editor = new context.PluginCommandEditor({}, {});
    assert.equal(editor.fs, host.fs);
    assert.equal(editor.path, host.path);
    const source = read('src/web/WebHost.js');
    assert.match(source, /RREncryptedAssets\.useFileSystem\(this\.fs, this\.path/);
    assert.match(read('css/theme.css'), /rr-plugin-image-picker-body/);
    assert.match(read('src/utils/PluginParamWidgets.js'), /event\.key === 'Tab'/);
});

test('choice, generic complex, icon, file, and audio dispatch remain on their established paths', () => {
    const context = sandbox();
    assert.ok(byClass(context.RRPluginParamWidgets.create({
        schema: { type: 'select', options: ['One'], values: ['1'] }, value: '1'
    }), 'rr-plugin-choice-select'));
    assert.equal(context.RRPluginParamWidgets.create({ schema: schema('string[]'), value: '[]' }), null);
    assert.equal(context.RRPluginParamWidgets.create({ schema: schema('struct<Row>'), value: '{}' }), null);
    assert.equal(context.RRPluginParamWidgets.create({ schema: schema('icon'), value: '3' }), null);
    assert.equal(context.RRPluginParamWidgets.create({ schema: { type: 'file', dir: 'audio/se' }, value: 'Coin' }), null);

    const managerSource = read('src/PluginManager.js');
    assert.match(managerSource, /metadata\.type === 'icon'/);
    assert.match(managerSource, /metadata\.type === 'file\[\]' && metadata\.dir && this\.isAudioDir/);
    const commandSource = read('src/event/commands/PluginCommandEditor.js');
    assert.match(commandSource, /case 'icon'/);
    assert.match(commandSource, /if \(!this\.showAudioPicker\(arg, input\)\) this\.showFilePicker\(arg, input\)/);
    assert.match(commandSource, /commands\.push\(\{\s*code: 657/);
    const html = read('index.html');
    assert.ok(html.indexOf('src/utils/PluginDataRefs.js') < html.indexOf('src/utils/PluginParamWidgets.js'));
});
