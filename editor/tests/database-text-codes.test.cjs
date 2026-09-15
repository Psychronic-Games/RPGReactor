const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const src = file => path.join(editorRoot, 'src', file);
const read = file => fs.readFileSync(src(file), 'utf8');
const TextCodes = require(src('utils/TextCodes.js'));
const MessageBoxes = require(src('utils/MessageBoxes.js'));

const enabled = [{ name: 'VisuMZ_1_MessageCore', status: true, parameters: {} }, { name: 'VisuMZ_0_CoreEngine', status: true, parameters: {} }];
const codesFor = (scope, options) => TextCodes.forScope(scope, enabled, options).flatMap(group => group.codes.map(entry => entry.code));
const groupIds = (scope, options) => TextCodes.forScope(scope, enabled, options).map(group => group.id);

test('descriptions take the help-window codes: wrap and pictures, not the message-only waits (GitHub #30)', () => {
    const help = codesFor('help');
    for (const code of ['\\C[n]', '\\I[n]', '\\V[n]', '<WordWrap>', '<linebreak>', '\\picture<x>', '<center>', '<b>', '<Caps>']) {
        assert.ok(help.includes(code), `${code} on a description`);
    }
    for (const code of ['\\$', '\\.', '\\|', '\\!', '\\>', '\\<', '\\^', '\\CommonEvent[x]', '\\Wait[x]', '<Auto>']) {
        assert.ok(!help.includes(code), `${code} withheld from a description`);
    }
});

test('battle-log messages take alignment but never word wrap or pictures', () => {
    const log = codesFor('battlelog');
    assert.ok(log.includes('<center>'));
    assert.ok(!log.includes('<WordWrap>'), 'a log line is one line tall');
    assert.ok(!log.includes('\\picture<x>'));
});

test('placeholders lead the message lists and are per field', () => {
    assert.deepEqual(groupIds('battlelog', { formatArgs: 'skillMessage' })[0], 'format');
    assert.deepEqual([...codesFor('battlelog', { formatArgs: 'skillMessage' }).slice(0, 2)], ['%1', '%2']);
    assert.deepEqual([...codesFor('battlelog', { formatArgs: 'stateMessage' }).slice(0, 1)], ['%1'], 'a state message takes one argument');
    assert.ok(!codesFor('battlelog', { formatArgs: 'stateMessage' }).includes('%2'));
    assert.ok(!groupIds('help').includes('format'), 'a description is not a format string');
});

test('the five editors mark their fields and the dispatcher decorates them once', () => {
    for (const file of ['DatabaseSkillEditor.js', 'DatabaseItemEditor.js', 'DatabaseWeaponEditor.js', 'DatabaseArmorEditor.js']) {
        const source = read(`database/${file}`);
        assert.match(source, /data-field="description"[^>]*data-rr-textcodes="help"/, `${file} description`);
        assert.match(source, /data-rr-textcodes-panel="help"/, `${file} panel`);
    }
    const state = read('database/DatabaseStateEditor.js');
    assert.equal((state.match(/data-rr-textcodes="battlelog:stateMessage"/g) || []).length, 4);
    assert.equal((state.match(/data-rr-textcodes-panel="battlelog:stateMessage"/g) || []).length, 1, 'four fields, one panel');
    const ui = read('DatabaseEditorUI.js');
    assert.match(ui, /RRDatabaseTextCodes\.decorate\(detailEl,/);
    const html = fs.readFileSync(path.join(editorRoot, 'index.html'), 'utf8');
    for (const script of ['utils/MessageBoxes', 'utils/TextCodes', 'utils/Windowskin', 'utils/ColorPickerModal', 'utils/TextCodeMenu', 'database/DatabaseTextCodes']) {
        assert.match(html, new RegExp(`src/${script}\\.js`), `${script} is loaded`);
    }
    assert.doesNotMatch(html, /IconPickerModal/, 'one icon grid: RRIconPicker');
    assert.ok(!fs.existsSync(src('utils/IconPickerModal.js')));
    assert.match(read('utils/TextCodeMenu.js'), /RRIconPicker\.show\(/);
});

test('the reference panel\'s filter box stays inside the card on a database form', () => {
    // .db-form gives every text input `width: 100%` (border-box), and the
    // filter also carries 6px of margin a side, so without an inline width
    // it ran 12px past the card on Items, Skills, Weapons, Armors and States.
    const menu = read('utils/TextCodeMenu.js');
    const at = menu.indexOf("filter.placeholder = tt('Filter codes');");
    assert.ok(at > 0, 'the filter box exists');
    const style = menu.slice(at, menu.indexOf('`;', menu.indexOf('filter.style.cssText', at)));
    assert.match(style, /margin: 0 6px 6px 6px;/);
    assert.match(style, /width: auto; align-self: stretch; box-sizing: border-box; min-width: 0;/,
        'the input fills the flex column between its margins rather than 100% plus them');
    const css = fs.readFileSync(path.join(editorRoot, 'css', 'styles.css'), 'utf8');
    assert.match(css, /\.db-form input\[type="text"\],[\s\S]*?width: 100%;/, 'the rule this guards against is still there');
});

test('a programmatic insert reaches the editor\'s change persistence; typing is left alone', () => {
    const Decorator = require(src('database/DatabaseTextCodes.js'));
    class FakeInputEvent extends Event {}
    global.InputEvent = FakeInputEvent;
    const listeners = {};
    const field = {
        getAttribute: () => 'help',
        addEventListener: (type, fn) => { listeners[type] = fn; },
        removeEventListener: () => {},
        dispatched: [],
        dispatchEvent(event) { this.dispatched.push(event.type); return true; }
    };
    const container = { querySelectorAll: selector => selector === '[data-rr-textcodes]' ? [field] : [] };
    global.window = global.window || globalThis;
    globalThis.RRTextCodeMenu = { attach: () => () => {}, createReferencePanel: () => ({}) };
    const detach = Decorator.decorate(container, { projectPath: () => '' });
    listeners.input(new Event('input'));
    assert.deepEqual(field.dispatched, ['change'], 'a plain Event (the menu\'s insert) is bridged to change');
    listeners.input(new FakeInputEvent('input'));
    assert.deepEqual(field.dispatched, ['change'], 'an InputEvent (typing) is not');
    detach();
    delete globalThis.RRTextCodeMenu;
});

test('a field marked for preview gets a line under it drawing its codes, hidden while it has none', () => {
    const Decorator = require(src('database/DatabaseTextCodes.js'));
    const listeners = {};
    const docListeners = {};
    const preview = { style: {}, hidden: false, textContent: 'stale', removed: false, remove() { this.removed = true; } };
    const field = {
        value: 'Talk to \\C[4]Reid\\C[0]',
        getAttribute: () => 'help',
        hasAttribute: name => name === 'data-rr-textcodes-preview',
        addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
        removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter(entry => entry !== fn); },
        dispatchEvent: () => true,
        insertAdjacentElement: (where, element) => { field.inserted = [where, element]; },
        ownerDocument: {
            createElement: () => preview,
            addEventListener: (type, fn) => { docListeners[type] = fn; },
            removeEventListener: type => { delete docListeners[type]; }
        }
    };
    const rendered = [];
    const container = { querySelectorAll: selector => selector === '[data-rr-textcodes]' ? [field] : [] };
    global.window = global.window || globalThis;
    globalThis.RRTextCodeMenu = {
        attach: () => () => {},
        createReferencePanel: () => ({}),
        hasPreviewableCode: text => /\\[A-Za-z]+\[/.test(text),
        renderPreview: (element, text, options) => { rendered.push([element, text, typeof options.iconSetUrl]); element.textContent = 'drawn'; }
    };
    try {
        const detach = Decorator.decorate(container, { projectPath: () => '' });
        assert.deepEqual(field.inserted, ['afterend', preview], 'the line sits directly under its field');
        assert.equal(preview.hidden, false);
        assert.deepEqual(rendered[0], [preview, 'Talk to \\C[4]Reid\\C[0]', 'function'], 'drawn with an icon sheet to draw from');
        assert.ok(docListeners['rr-windowskin-loaded'], 'repainted once the project palette loads');
        field.value = 'Plain words';
        for (const fn of listeners.input) fn(new Event('input'));
        assert.equal(preview.hidden, true, 'no code, no line');
        assert.equal(preview.textContent, '');
        detach();
        assert.equal(preview.removed, true);
        assert.equal(docListeners['rr-windowskin-loaded'], undefined);
    } finally {
        delete globalThis.RRTextCodeMenu;
    }
});

test('an unmarked field gets no preview line', () => {
    const Decorator = require(src('database/DatabaseTextCodes.js'));
    let inserted = false;
    const field = {
        value: '\\C[4]x', getAttribute: () => 'help', hasAttribute: () => false,
        addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
        insertAdjacentElement: () => { inserted = true; }, ownerDocument: { createElement: () => ({ style: {} }) }
    };
    global.window = global.window || globalThis;
    globalThis.RRTextCodeMenu = { attach: () => () => {}, createReferencePanel: () => ({}), hasPreviewableCode: () => true, renderPreview: () => {} };
    try {
        Decorator.decorate({ querySelectorAll: selector => selector === '[data-rr-textcodes]' ? [field] : [] }, { projectPath: () => '' })();
        assert.equal(inserted, false, 'Items, Skills and the rest look as they did');
    } finally {
        delete globalThis.RRTextCodeMenu;
    }
});

test('OK on an untouched run writes back exactly what was read (review of #29)', () => {
    const list = [
        { code: 101, indent: 0, parameters: ['', 0, 0, 0, ''] },
        { code: 401, indent: 0, parameters: ['one'] }, { code: 401, indent: 0, parameters: ['two'] },
        { code: 401, indent: 0, parameters: ['three'] }, { code: 401, indent: 0, parameters: ['four'] },
        { code: 401, indent: 0, parameters: ['five'] }, { code: 401, indent: 0, parameters: [''] }
    ];
    const run = MessageBoxes.collectRun(list, 0);
    const back = MessageBoxes.buildCommands(run.boxes, 0, 4);
    assert.deepEqual(JSON.parse(JSON.stringify(back)), JSON.parse(JSON.stringify(list)), 'a six-line plugin-authored box is not re-split, nor its trailing blank dropped');
    run.boxes[0].lines[0] = 'edited';
    const edited = MessageBoxes.buildCommands(run.boxes, 0, 4);
    assert.equal(edited.filter(c => c.code === 101).length, 2, 'once edited, the window height applies');
});
